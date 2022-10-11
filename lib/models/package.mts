import { CoreV1Api, CustomObjectsApi, KubeConfig, loadYaml, V1ConfigMap, V1Secret } from "@kubernetes/client-node";
import { blue, bright, lightCyan, red, yellow } from "ansicolor";
import { readFile } from "node:fs/promises";
import { constants } from "../constants.mjs";
import { appendDryRunTag, GenericK8sSpecType, K8sApiResponse as K8sApiListResponse } from "../k8s.mjs";
import { getDirName } from "../utils.mjs";
import { Arguments } from "./argument.mjs";
import { PackageInfo } from "./info.mjs";
import { Parameter } from "./parameter.mjs";
import { Template } from "./template.mjs";

const kc = new KubeConfig();
kc.loadFromDefault();

const customK8sApi = kc.makeApiClient(CustomObjectsApi);
const coreK8sApi = kc.makeApiClient(CoreV1Api);

export class Package {
    metadata: any;
    spec: any;
    info: PackageInfo;
    isExecutable: boolean;
    arguments: Arguments;
    templates: Template[];

    /**
     * Create an Argo Package object
     * @param {Object} k8sYaml
     */
    constructor(k8sYaml: GenericK8sSpecType) {
        this.metadata = k8sYaml.metadata;
        this.spec = k8sYaml.spec;
        this.info = new PackageInfo(this.metadata.labels);
        this.isExecutable = this.spec.entrypoint !== undefined;
        this.arguments = new Arguments(this.spec.arguments);
        this.templates = Template.generate(this.spec.templates);
    }

    /**
     * Get package info
     * @returns
     */
    async packageInfo(namespace: string) {
        let info = `${this.info.info()}\n`;

        info += `${yellow("Executable:")} ${lightCyan(`${this.isExecutable}`)}\n`;

        info += `${this.arguments.info()}\n`;

        let templatesInfo = blue(bright("Templates: \n"));
        this.templates.forEach((template) => {
            templatesInfo += `- ${yellow(template.name)}\n`;
        });
        info += templatesInfo;

        const pipelines = await Package.pipelines(namespace, this.info.name);
        let pipelinesInfo = blue(bright("\nPipelines: \n"));
        pipelines.forEach((pipeline: { metadata: { name: string | number } }) => {
            pipelinesInfo += `- ${yellow(pipeline.metadata.name)}\n`;
        });
        info += pipelinesInfo;

        const configMaps = await Package.configMaps(namespace, this.info.name);
        let configMapInfo = blue(bright("\nConfig Maps: \n"));
        configMaps.forEach((configMap) => {
            configMapInfo += `- ${yellow(configMap.metadata?.name)}\n`;
        });
        info += configMapInfo;

        const secrets = await Package.secrets(namespace, this.info.name);
        if (secrets.length != 0) {
            let secretInfo = blue(bright("\nSecrets: \n"));
            secrets.forEach((secret) => {
                secretInfo += `- ${yellow(secret.metadata?.name)}\n`;
            });
            info += secretInfo;
        }

        const cronWorkflows = await Package.cronWorkflows(namespace, this.info.name);
        let cronWorkflowInfo = blue(bright("\nCron Workflows: \n"));
        cronWorkflows.forEach(
            (cronWorkflow: { spec: { schedule: any; timezone: any }; metadata: { name: string | number } }) => {
                const cronString = cronWorkflow.spec.schedule;
                const cronTimezone = cronWorkflow.spec.timezone;
                cronWorkflowInfo += `- Name: ${yellow(cronWorkflow.metadata.name)}, Schedule: ${lightCyan(
                    cronString
                )}, Timezone: ${lightCyan(cronTimezone)}\n`;
            }
        );
        info += cronWorkflowInfo;

        return info;
    }

    /**
     * @param {string} templateName
     */
    templateInfo(templateName: string) {
        return this.templateForName(templateName).info();
    }

    /**
     *
     * @param name
     * @returns
     */
    templateForName(name: string) {
        const chosenTemplate = this.templates.find((template) => template.name === name);

        if (!chosenTemplate) {
            console.error(red("Template not found in package"));
            process.exit(1);
        }

        return chosenTemplate;
    }

    /**
     * Delete the package and all its dependencies
     * Steps:
     * 1. Delete all dependencies
     * 2. Delete the workflow template
     * 3. Delete the config maps
     * @returns
     */
    async delete(cluster: boolean, namespace: string, dryRun?: string) {
        for (const dependencyPackage of await this.dependencies(cluster)) {
            appendDryRunTag(dryRun, `Deleting dependent package ${dependencyPackage.info.name}`);
            await dependencyPackage.delete(cluster, namespace, dryRun);
        }

        await this.deleteConfigMaps(namespace, dryRun);
        await this.deleteSecrets(namespace, dryRun);
        await this.deletePipelines(namespace, dryRun);
        await this.deleteCronWorkflows(namespace, dryRun);
        await this.deleteWorkflowTemplates(namespace, cluster, dryRun);
    }

    /**
     * Get all dependencies of the packages installed
     * @param {boolean} cluster
     * @returns
     */
    async dependencies(cluster: boolean) {
        const result = await Package.workflowTemplates(
            this.metadata.namespace,
            cluster,
            this.info.getDependencyLabel()
        );
        return this.getDependentPackagesFromListResponse(result);
    }

    /**
     * Get all dependencies
     * @returns
     */
    getDependentPackagesFromListResponse(items: any) {
        const packages: Package[] = [];
        items.forEach((template: any) => {
            const argoPackage = new Package(template);
            if (argoPackage.info.name !== this.info.name) {
                packages.push(argoPackage);
            }
        });
        return packages;
    }

    /**
     * Returns all config maps associated with the package
     * @returns
     */
    static async configMaps(namespace: string, labelSelector: string): Promise<V1ConfigMap[]> {
        const response = await coreK8sApi.listNamespacedConfigMap(
            namespace,
            undefined,
            undefined,
            undefined,
            undefined,
            labelSelector
        );
        return response.body.items;
    }

    /**
     * Deletes all configmaps associated with the package
     * @returns
     */
    async deleteConfigMaps(namespace: any, dryRun?: string) {
        appendDryRunTag(dryRun, `Deleting configmaps for package ${this.metadata.name}`);

        const toDelete = [];
        for (const configMap of await Package.configMaps(namespace, PackageInfo.getPackageLabel(this.info.name))) {
            toDelete.push(
                coreK8sApi.deleteNamespacedConfigMap(
                    configMap.metadata.name,
                    configMap.metadata.namespace,
                    undefined,
                    dryRun
                )
            );
        }

        return await Promise.all(toDelete);
    }

    /**
     * Returns all secrets associated with the package
     * @returns
     */
    static async secrets(namespace: string, labelSelector: string): Promise<V1Secret[]> {
        const response = await coreK8sApi.listNamespacedSecret(
            namespace,
            undefined,
            undefined,
            undefined,
            undefined,
            labelSelector
        );
        return response.body.items;
    }

    /**
     * Deletes all secrets associated with the package
     * @returns
     */
    async deleteSecrets(namespace: any, dryRun?: string) {
        appendDryRunTag(dryRun, `Deleting secrets for package ${this.metadata.name}`);

        const toDelete = [];
        const secrets = await Package.secrets(namespace, PackageInfo.getPackageLabel(this.info.name));
        for (const secret of secrets) {
            toDelete.push(
                coreK8sApi.deleteNamespacedSecret(secret.metadata.name, secret.metadata.namespace, undefined, dryRun)
            );
        }

        return await Promise.all(toDelete);
    }

    /**
     * Returns all piplines associated with the package
     * @returns
     */
    static async pipelines(namespace: string, labelSelector: string) {
        const response = await customK8sApi.listNamespacedCustomObject(
            constants.ARGO_DATAFLOW_K8S_API_GROUP,
            constants.ARGO_K8S_API_VERSION,
            namespace,
            constants.ARGO_PIPELINES_PLURAL,
            undefined,
            undefined,
            undefined,
            undefined,
            labelSelector
        );
        return response.body["items"];
    }

    /**
     * Deletes all pipelines associated with the package
     * @returns
     */
    async deletePipelines(namespace: any, dryRun?: string) {
        appendDryRunTag(dryRun, `Deleting pipelines for package ${this.metadata.name}`);

        const toDelete = [];
        for (const pipeline of await Package.pipelines(namespace, PackageInfo.getPackageLabel(this.info.name))) {
            toDelete.push(
                customK8sApi.deleteNamespacedCustomObject(
                    constants.ARGO_DATAFLOW_K8S_API_GROUP,
                    constants.ARGO_K8S_API_VERSION,
                    pipeline.metadata.namespace,
                    constants.ARGO_PIPELINES_PLURAL,
                    pipeline.metadata.name,
                    undefined,
                    undefined,
                    undefined,
                    dryRun
                )
            );
        }
        return await Promise.all(toDelete);
    }

    /**
     * Returns all cron workflows associated with the package
     * @returns
     */
    static async cronWorkflows(namespace: string, labelSelector: string) {
        const response = await customK8sApi.listNamespacedCustomObject(
            constants.ARGO_K8S_API_GROUP,
            constants.ARGO_K8S_API_VERSION,
            namespace,
            constants.ARGO_CRON_WORKFLOW_PLURAL,
            undefined,
            undefined,
            undefined,
            undefined,
            labelSelector
        );
        return response.body["items"];
    }

    /**
     * Deletes cronworkflows associated with the package
     * @returns
     */
    async deleteCronWorkflows(namespace: any, dryRun?: string) {
        appendDryRunTag(dryRun, `Deleting cronworkflows for package ${this.metadata.name}`);

        const toDelete = [];
        for (const cronWorkflow of await Package.cronWorkflows(
            namespace,
            PackageInfo.getPackageLabel(this.info.name)
        )) {
            toDelete.push(
                customK8sApi.deleteNamespacedCustomObject(
                    constants.ARGO_K8S_API_GROUP,
                    constants.ARGO_K8S_API_VERSION,
                    cronWorkflow.metadata.namespace,
                    constants.ARGO_CRON_WORKFLOW_PLURAL,
                    cronWorkflow.metadata.name,
                    undefined,
                    undefined,
                    dryRun
                )
            );
        }
        return await Promise.all(toDelete);
    }

    /**
     * Returns all cron workflows associated with the package
     * @returns
     */
    static async workflowTemplates(namespace: string, cluster: boolean, labelSelector: string) {
        let response;
        if (cluster) {
            response = await customK8sApi.listClusterCustomObject(
                constants.ARGO_K8S_API_GROUP,
                constants.ARGO_K8S_API_VERSION,
                constants.ARGO_CLUSTER_WORKFLOW_TEMPLATES_PLURAL,
                undefined,
                undefined,
                undefined,
                undefined,
                labelSelector,
            );
        } else {
            response = await customK8sApi.listNamespacedCustomObject(
                constants.ARGO_K8S_API_GROUP,
                constants.ARGO_K8S_API_VERSION,
                namespace,
                constants.ARGO_WORKFLOW_TEMPLATES_PLURAL,
                undefined,
                undefined,
                undefined,
                undefined,
                labelSelector
            );
        }
        return response.body.items;
    }

    /**
     * Deletes workflow templates associated with the package
     * @returns
     */
    async deleteWorkflowTemplates(namespace: string, cluster: boolean, dryRun?: string) {
        appendDryRunTag(dryRun, `Deleting templates for package ${this.metadata.name}`);

        let toDelete = [];
        for (const workflowTemplate of await Package.workflowTemplates(
            namespace,
            cluster,
            PackageInfo.getPackageLabel(this.info.name)
        )) {
            if (workflowTemplate.kind === constants.ARGO_WORKFLOW_TEMPLATES_KIND) {
                toDelete.push(
                    customK8sApi.deleteNamespacedCustomObject(
                        constants.ARGO_K8S_API_GROUP,
                        constants.ARGO_K8S_API_VERSION,
                        workflowTemplate.metadata.namespace,
                        constants.ARGO_WORKFLOW_TEMPLATES_PLURAL,
                        workflowTemplate.metadata.name,
                        undefined,
                        undefined,
                        dryRun
                    )
                );
            } else {
                toDelete.push(
                    customK8sApi.deleteClusterCustomObject(
                        constants.ARGO_K8S_API_GROUP,
                        constants.ARGO_K8S_API_VERSION,
                        constants.ARGO_CLUSTER_WORKFLOW_TEMPLATES_PLURAL,
                        workflowTemplate.metadata.name,
                        undefined,
                        undefined,
                        dryRun
                    )
                );
            }
        }
        return await Promise.all(toDelete);
    }

    /**
     * Run the workflow template
     * @param {Object} args
     * @param {string} serviceAccountName
     * @param {string} imagePullSecrets
     * @param {boolean} cluster
     * @param {string} namespace
     * @returns
     */
    async run(
        args: { parameters: Parameter[] },
        serviceAccountName: string,
        imagePullSecrets: string,
        cluster: boolean,
        namespace: string
    ) {
        if (!this.isExecutable) {
            throw "Package is not runnable";
        }

        const __dirname = getDirName(import.meta.url);

        const runtimeArguments = new Arguments(args);
        this.arguments.checkRequiredArgs(runtimeArguments);
        const yamlStr = await readFile(`${__dirname}/../static/workflows/workflow.yaml`);
        const workflow: any = loadYaml(yamlStr.toString());

        const name = this.metadata.name;
        workflow.metadata.generateName = `${name}-`;
        if (serviceAccountName) {
            workflow.spec.serviceAccountName = serviceAccountName;
        }

        if (imagePullSecrets) {
            workflow.spec.imagePullSecrets = [{ name: imagePullSecrets }];
        }

        workflow.spec.workflowTemplateRef.name = name;
        workflow.spec.workflowTemplateRef.clusterScope = cluster;
        workflow.spec.arguments = runtimeArguments;

        customK8sApi.createNamespacedCustomObject(
            constants.ARGO_K8S_API_GROUP,
            constants.ARGO_K8S_API_VERSION,
            namespace,
            constants.ARGO_WORKFLOWS_PLURAL,
            workflow
        );
    }

    /**
     * Run a template
     * @param {string} templateName
     * @param {Object} args
     * @param {string} serviceAccountName
     * @param {string} imagePullSecrets
     * @param {boolean} cluster
     * @param {string} namespace
     * @returns
     */
    async runTemplate(
        templateName: string,
        args: object,
        serviceAccountName: string,
        imagePullSecrets: string,
        cluster: boolean,
        namespace: string
    ) {
        const template = this.templateForName(templateName);
        const workflow = await template.generateWorkflow(
            this.metadata.name,
            args,
            serviceAccountName,
            imagePullSecrets,
            cluster
        );
        return await customK8sApi.createNamespacedCustomObject(
            constants.ARGO_K8S_API_GROUP,
            constants.ARGO_K8S_API_VERSION,
            namespace,
            constants.ARGO_WORKFLOWS_PLURAL,
            workflow
        );
    }

    /**
     * Get Installer label
     * @returns {string}
     */
    static getInstallerLabel(): string {
        return `${constants.ARGOPM_INSTALLER_LABEL}=${constants.ARGOPM_INSTALLER_LABEL_VALUE}`;
    }

    /**
     * Get install package
     * @param {string} namespace
     * @param {string} packageName
     * @param {boolean} cluster
     * @returns
     */
    static async info(namespace: string, packageName: string, cluster: boolean) {
        const items = await Package.workflowTemplates(namespace, cluster, PackageInfo.getPackageLabel(packageName));
        if (items.length !== 1) {
            console.error(red(`Package "${packageName}" is not found.`));
            process.exit(1);
        }
        return new Package(items[0]);
    }

    /**
     * Get all installed packages in the namespace
     * @param {string} namespace
     * @param {boolean} cluster
     * @returns {Package[]} packages
     */
    static async list(namespace: string, cluster: boolean): Promise<Package[]> {
        const result = await Package.workflowTemplates(namespace, cluster, Package.getInstallerLabel());
        const allPackageInfos = result.map((template: any) => new Package(template).info);
        const uniquePackages = [];
        const uniquePackageMap = {};
        allPackageInfos.forEach((info: PackageInfo) => {
            const key = `${info.name}|${info.version}|${info.parent}|${info.registry}`;
            if (!(key in uniquePackageMap)) {
                uniquePackageMap[key] = undefined;
                uniquePackages.push(info);
            }
        });
        return uniquePackages;
    }
}
