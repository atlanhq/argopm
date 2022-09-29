import { CoreV1Api, CustomObjectsApi, KubeConfig, V1ConfigMap, V1Secret } from "@kubernetes/client-node";
import { blue, bright, lightCyan, yellow } from "ansicolor";
import { load } from "js-yaml";
import { readFile } from "node:fs/promises";
import { constants } from "../constants";
import { K8sApiResponse as K8sApiListResponse } from "../k8s";
import { Argument } from "./argument";
import { PackageInfo } from "./info";
import { Parameter } from "./parameter";
import { Template } from "./template";

const kc = new KubeConfig();
kc.loadFromDefault();

const customK8sApi = kc.makeApiClient(CustomObjectsApi);
const coreK8sApi = kc.makeApiClient(CoreV1Api);

export class Package {
    metadata: any;
    spec: any;
    info: PackageInfo;
    isExecutable: boolean;
    arguments: Argument;
    templates: Template[];

    /**
     * Create an Argo Package object
     * @param {Object} k8sYaml
     */
    constructor(k8sYaml: { metadata: any; spec: any }) {
        this.metadata = k8sYaml.metadata;
        this.spec = k8sYaml.spec;
        this.info = new PackageInfo(this.metadata.labels);
        this.isExecutable = !!this.spec.entrypoint;
        this.arguments = new Argument(this.spec.arguments);
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

        const pipelines = await this.pipelines(namespace);
        let pipelinesInfo = blue(bright("\nPipelines: \n"));
        pipelines.forEach((pipeline: { metadata: { name: string | number } }) => {
            pipelinesInfo += `- ${yellow(pipeline.metadata.name)}\n`;
        });
        info += pipelinesInfo;

        const configMaps = await this.configMaps(namespace);
        let configMapInfo = blue(bright("\nConfig Maps: \n"));
        configMaps.forEach((configMap) => {
            configMapInfo += `- ${yellow(configMap.metadata?.name)}\n`;
        });
        info += configMapInfo;

        const secrets = await this.secrets(namespace);
        if (secrets.length != 0) {
            let secretInfo = blue(bright("\nSecrets: \n"));
            secrets.forEach((secret) => {
                secretInfo += `- ${yellow(secret.metadata?.name)}\n`;
            });
            info += secretInfo;
        }

        const cronWorkflows = await this.cronWorkflows(namespace);
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
            throw new Error("Template not found in package");
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
    async delete(cluster: boolean, namespace: string) {
        for (const dependencyPackage of await this.dependencies(cluster)) {
            console.log(`Deleting dependent package ${dependencyPackage.info.name}`);
            await dependencyPackage.delete(cluster, namespace);
        }

        console.log(`Deleting config maps for package ${this.metadata.name}`);
        await this.deleteConfigMaps(namespace);

        console.log(`Deleting secrets for package ${this.metadata.name}`);
        await this.deleteSecrets(namespace);

        console.log(`Deleting pipelines for package ${this.metadata.name}`);
        await this.deletePipelines(namespace);

        console.log(`Deleting cronworkflows for package ${this.metadata.name}`);
        await this.deleteCronWorkflows(namespace);

        console.log(`Deleting templates for package ${this.metadata.name}`);
        let kind = constants.ARGO_WORKFLOW_TEMPLATES_KIND;
        let plural = `${kind.toLowerCase()}s`;

        if (cluster) {
            kind = constants.ARGO_CLUSTER_WORKFLOW_TEMPLATES_KIND;
            plural = `${kind.toLowerCase()}s`;
            await customK8sApi.deleteClusterCustomObject(
                constants.ARGO_K8S_API_GROUP,
                constants.ARGO_K8S_API_VERSION,
                plural,
                this.metadata.name
            );
        } else {
            await customK8sApi.deleteNamespacedCustomObject(
                constants.ARGO_K8S_API_GROUP,
                constants.ARGO_K8S_API_VERSION,
                this.metadata.namespace,
                plural,
                this.metadata.name
            );
        }
    }

    /**
     * Get all dependencies of the packages installed
     * @param {boolean} cluster
     * @returns
     */
    async dependencies(cluster: boolean) {
        let kind = constants.ARGO_WORKFLOW_TEMPLATES_KIND;
        let plural = `${kind.toLowerCase()}s`;
        let response: K8sApiListResponse;

        if (cluster) {
            kind = constants.ARGO_CLUSTER_WORKFLOW_TEMPLATES_KIND;
            plural = `${kind.toLowerCase()}s`;
            response = await customK8sApi.listClusterCustomObject(
                constants.ARGO_K8S_API_GROUP,
                constants.ARGO_K8S_API_VERSION,
                plural,
                undefined,
                undefined,
                undefined,
                undefined,
                this.info.getDependencyLabel()
            );
        } else {
            response = await customK8sApi.listNamespacedCustomObject(
                constants.ARGO_K8S_API_GROUP,
                constants.ARGO_K8S_API_VERSION,
                this.metadata.namespace,
                plural,
                undefined,
                undefined,
                undefined,
                undefined,
                this.info.getDependencyLabel()
            );
        }
        return this.getDependentPackagesFromListResponse(response);
    }

    /**
     * Get all dependencies
     * @returns
     */
    getDependentPackagesFromListResponse(response: K8sApiListResponse) {
        const packages: Package[] = [];
        response.body.items.forEach((template: any) => {
            const argoPackage = new Package(template);
            if (argoPackage.info.name !== this.info.name) {
                packages.push(new Package(template));
            }
        });
        return packages;
    }

    /**
     * Returns all config maps associated with the package
     * @returns
     */
    async configMaps(namespace: string): Promise<V1ConfigMap[]> {
        const response = await coreK8sApi.listNamespacedConfigMap(
            namespace,
            undefined,
            undefined,
            undefined,
            undefined,
            this.info.getPackageLabel()
        );
        return response.body.items;
    }

    /**
     * Deletes all configmaps associated with the package
     * @returns
     */
    async deleteConfigMaps(namespace: any) {
        const configMaps = await this.configMaps(namespace);
        for (const configMap of configMaps) {
            const metadata = configMap.metadata;
            if (metadata?.name && metadata.namespace) {
                await coreK8sApi.deleteNamespacedConfigMap(metadata.name, metadata.namespace);
            } else {
                console.error(`Cannot proceed with ${metadata}.`);
            }
        }
    }

    /**
     * Returns all secrets associated with the package
     * @returns
     */
    async secrets(namespace: string): Promise<V1Secret[]> {
        const response = await coreK8sApi.listNamespacedSecret(
            namespace,
            undefined,
            undefined,
            undefined,
            undefined,
            this.info.getPackageLabel()
        );
        return response.body.items;
    }

    /**
     * Deletes all secrets associated with the package
     * @returns
     */
    async deleteSecrets(namespace: any) {
        const secrets = await this.secrets(namespace);
        for (const secret of secrets) {
            const metadata = secret.metadata;
            if (metadata?.name && metadata.namespace) {
                await coreK8sApi.deleteNamespacedSecret(metadata.name, metadata.namespace);
            }
            return;
        }
    }

    /**
     * Returns all piplines associated with the package
     * @returns
     */
    async pipelines(namespace: string) {
        const plural = `${constants.ARGO_DATAFLOW_KIND.toLowerCase()}s`;
        const response = await customK8sApi.listNamespacedCustomObject(
            constants.ARGO_DATAFLOW_K8S_API_GROUP,
            constants.ARGO_K8S_API_VERSION,
            namespace,
            plural,
            undefined,
            undefined,
            undefined,
            undefined,
            this.info.getPackageLabel()
        );
        return response.body["items"];
    }

    /**
     * Deletes all pipelines associated with the package
     * @returns
     */
    async deletePipelines(namespace: any) {
        const plural = `${constants.ARGO_DATAFLOW_KIND.toLowerCase()}s`;
        for (const pipeline of await this.pipelines(namespace)) {
            const metadata = pipeline.metadata;
            await customK8sApi.deleteNamespacedCustomObject(
                constants.ARGO_DATAFLOW_K8S_API_GROUP,
                constants.ARGO_K8S_API_VERSION,
                metadata.namespace,
                plural,
                metadata.name
            );
        }
    }

    /**
     * Returns all cron workflows associated with the package
     * @returns
     */
    async cronWorkflows(namespace: string) {
        const plural = `${constants.ARGO_CRON_WORKFLOW_KIND.toLowerCase()}s`;
        const response = await customK8sApi.listNamespacedCustomObject(
            constants.ARGO_K8S_API_GROUP,
            constants.ARGO_K8S_API_VERSION,
            namespace,
            plural,
            undefined,
            undefined,
            undefined,
            undefined,
            this.info.getPackageLabel()
        );
        return response.body["items"];
    }

    /**
     * Deletes cronworkflows associated with the package
     * @returns
     */
    async deleteCronWorkflows(namespace: any) {
        const plural = `${constants.ARGO_CRON_WORKFLOW_KIND.toLowerCase()}s`;
        for (const cronWorkflow of await this.cronWorkflows(namespace)) {
            const metadata = cronWorkflow.metadata;
            await customK8sApi.deleteNamespacedCustomObject(
                constants.ARGO_K8S_API_GROUP,
                constants.ARGO_K8S_API_VERSION,
                metadata.namespace,
                plural,
                metadata.name
            );
        }
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

        const runtimeArguments = new Argument(args);
        this.arguments.checkRequiredArgs(runtimeArguments);
        const yamlStr = await readFile(`${__dirname}/../static/workflows/workflow.yaml`);
        const workflow: any = load(yamlStr.toString());

        const name = this.metadata.name;
        workflow.metadata.generateName = `${name}-`;
        if (serviceAccountName) workflow.spec.serviceAccountName = serviceAccountName;
        if (imagePullSecrets) workflow.spec.imagePullSecrets = [{ name: imagePullSecrets }];
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
        const workflow = template.generateWorkflow(
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
    static getInstallerLabel() {
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
        let response: K8sApiListResponse;
        let plural = `${constants.ARGO_WORKFLOW_TEMPLATES_KIND.toLowerCase()}s`;

        if (cluster) {
            plural = `${constants.ARGO_CLUSTER_WORKFLOW_TEMPLATES_KIND.toLowerCase()}s`;
            response = await customK8sApi.listClusterCustomObject(
                constants.ARGO_K8S_API_GROUP,
                constants.ARGO_K8S_API_VERSION,
                plural,
                undefined,
                undefined,
                undefined,
                undefined,
                PackageInfo.getPackageLabel(packageName)
            );
        } else {
            response = await customK8sApi.listNamespacedCustomObject(
                constants.ARGO_K8S_API_GROUP,
                constants.ARGO_K8S_API_VERSION,
                namespace,
                plural,
                undefined,
                undefined,
                undefined,
                undefined,
                PackageInfo.getPackageLabel(packageName)
            );
        }
        const items = response.body.items;
        if (items.length !== 1) {
            throw new Error(`${packageName} not found`);
        }
        return new Package(items[0]);
    }

    /**
     * Get all installed packages in the namespace
     * @param {string} namespace
     * @param {boolean} cluster
     * @returns
     */
    static async list(namespace: string, cluster: boolean) {
        let response: K8sApiListResponse;
        let plural = `${constants.ARGO_WORKFLOW_TEMPLATES_KIND.toLowerCase()}s`;

        if (cluster) {
            plural = `${constants.ARGO_CLUSTER_WORKFLOW_TEMPLATES_KIND.toLowerCase()}s`;
            response = await customK8sApi.listClusterCustomObject(
                constants.ARGO_K8S_API_GROUP,
                constants.ARGO_K8S_API_VERSION,
                plural,
                undefined,
                undefined,
                undefined,
                undefined,
                Package.getInstallerLabel()
            );
        } else {
            response = await customK8sApi.listNamespacedCustomObject(
                constants.ARGO_K8S_API_GROUP,
                constants.ARGO_K8S_API_VERSION,
                namespace,
                plural,
                undefined,
                undefined,
                undefined,
                undefined,
                Package.getInstallerLabel()
            );
        }
        return response.body.items.map((template: any) => new Package(template));
    }
}
