import { yellow, blue, bright, lightCyan } from "ansicolor";
import { readFile } from "node:fs/promises";
import { PackageInfo } from "./info";
import { Argument } from "./argument";
import { Template } from "./template";
import { constants } from "../constants";
import { load } from "js-yaml";
import { KubeConfig, CoreV1Api, CustomObjectsApi, V1ConfigMap, V1Secret } from "@kubernetes/client-node";

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
    constructor(k8sYaml) {
        this.metadata = k8sYaml.metadata;
        this.spec = k8sYaml.spec;
        this.info = new PackageInfo(this.metadata.labels);
        this.isExecutable = !!this.spec.entrypoint;
        this.arguments = new Argument(this.spec.arguments);
        this.templates = Template.generate(this.spec.templates);
    }

    /**
     * Get package info
     * @returns {Promise<string>}
     */
    packageInfo(namespace) {
        let info = `${this.info.info()}\n`;

        info += `${yellow("Executable:")} ${lightCyan(`${this.isExecutable}`)}\n`;

        info += `${this.arguments.info()}\n`;

        let templatesInfo = blue(bright("Templates: \n"));
        this.templates.forEach((template) => {
            templatesInfo += `- ${yellow(template.name)}\n`;
        });
        info += templatesInfo;

        return this.pipelines(namespace)
            .then((pipelines) => {
                let pipelinesInfo = blue(bright("\nPipelines: \n"));
                pipelines.forEach((pipeline) => {
                    pipelinesInfo += `- ${yellow(pipeline.metadata.name)}\n`;
                });
                info += pipelinesInfo;
                return this.configMaps(namespace);
            })
            .then((configMaps) => {
                let configMapInfo = blue(bright("\nConfig Maps: \n"));
                configMaps.forEach((configMap) => {
                    configMapInfo += `- ${yellow(configMap.metadata?.name)}\n`;
                });
                info += configMapInfo;
                return this.secrets(namespace);
            })
            .then((secrets) => {
                if (secrets.length != 0) {
                    let secretInfo = blue(bright("\nSecrets: \n"));
                    secrets.forEach((secret) => {
                        secretInfo += `- ${yellow(secret.metadata?.name)}\n`;
                    });
                    info += secretInfo;
                }
                return this.cronWorkflows(namespace);
            })
            .then((cronWorkflows) => {
                let cronWorkflowInfo = blue(bright("\nCron Workflows: \n"));
                cronWorkflows.forEach((cronWorkflow) => {
                    const cronString = cronWorkflow.spec.schedule;
                    const cronTimezone = cronWorkflow.spec.timezone;
                    cronWorkflowInfo += `- Name: ${yellow(cronWorkflow.metadata.name)}, Schedule: ${lightCyan(
                        cronString
                    )}, Timezone: ${lightCyan(cronTimezone)}\n`;
                });
                info += cronWorkflowInfo;
                return info;
            });
    }

    /**
     * @param {string} templateName
     */
    templateInfo(templateName) {
        return this.templateForName(templateName).info();
    }

    /**
     *
     * @param name
     * @returns {Promise<{Template}>}
     */
    templateForName(name) {
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
     * @returns {Promise<{response: http.IncomingMessage, body: object}>}
     */
    async delete(cluster, namespace) {
        for (const dependencyPackage of await this.dependencies(cluster)) {
            console.log(`Deleting dependent package ${dependencyPackage.info.name}`);
            dependencyPackage.delete(cluster, namespace);
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
     * @param {Boolean} cluster
     * @returns
     */
    async dependencies(cluster: boolean) {
        let kind = constants.ARGO_WORKFLOW_TEMPLATES_KIND;
        let plural = `${kind.toLowerCase()}s`;
        let response;

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
     * @returns {Promise<[Package]>}
     */
    getDependentPackagesFromListResponse(response) {
        const packages: Package[] = [];
        response.body.items.forEach((template) => {
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
    async configMaps(namespace): Promise<V1ConfigMap[]> {
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
    async deleteConfigMaps(namespace) {
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
     * @returns {Promise<Array<V1Secret>>}
     */
    async secrets(namespace): Promise<V1Secret[]> {
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
     * @returns {Promise<Any>}
     */
    async deleteSecrets(namespace) {
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
     * @returns {Promise<Array<Object>>}
     */
    async pipelines(namespace) {
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
     * @returns {Promise<Any>}
     */
    async deletePipelines(namespace) {
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
     * @returns {Promise<Array<CronWorkflow>>}
     */
    async cronWorkflows(namespace) {
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
     * @returns {Promise<Any>}
     */
    async deleteCronWorkflows(namespace) {
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
     * @param {Boolean} cluster
     * @param {string} namespace
     * @returns {PromiseLike<{response: http.IncomingMessage, body: object}>}
     */
    async run(args, serviceAccountName, imagePullSecrets, cluster, namespace) {
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
     * @param {Boolean} cluster
     * @param {string} namespace
     * @returns {Promise<{response: http.IncomingMessage, body: object}>}
     */
    async runTemplate(templateName, args, serviceAccountName, imagePullSecrets, cluster, namespace) {
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
     * @param {String} namespace
     * @param {String} packageName
     * @param {Boolean} cluster
     * @returns {Promise<Package>}
     */
    static async info(namespace, packageName, cluster) {
        let response;
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
     * @param {String} namespace
     * @param {Boolean} cluster
     * @returns {Promise<[Package]>}
     */
    static async list(namespace, cluster) {
        let response;
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
            response = customK8sApi.listNamespacedCustomObject(
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
        return handleListResponse(response);
    }
}

/**
 * Handle k8s list response
 * @returns {Promise<[Package]>}
 */
function handleListResponse(response): Package[] {
    return response.body.items.map((template) => new Package(template));
}
