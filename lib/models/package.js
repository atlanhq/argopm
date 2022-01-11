"use strict";
const constants = require("../constants").constants;
const Promise = require("bluebird");
const fs = Promise.promisifyAll(require("fs"));
const yaml = require("js-yaml");

const k8s = require("@kubernetes/client-node");
const kc = new k8s.KubeConfig();
kc.loadFromDefault();

const customK8sApi = kc.makeApiClient(k8s.CustomObjectsApi);
const coreK8sApi = kc.makeApiClient(k8s.CoreV1Api);

const PackageInfo = require("./info").PackageInfo;
const Argument = require("./argument").Argument;
const Template = require("./template").Template;
const { yellow, blue, bright, lightCyan } = require("ansicolor");

class Package {
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

        info += `${yellow("Executable:")} ${lightCyan(this.isExecutable)}\n`;

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
                    configMapInfo += `- ${yellow(configMap.metadata.name)}\n`;
                });
                info += configMapInfo;
                return this.secrets(namespace);
            })
            .then((secrets) => {
                if (secrets.length != 0) {
                    let secretInfo = blue(bright("\nSecrets: \n"));
                    secrets.forEach((secret) => {
                        secretInfo += `- ${yellow(secret.metadata.name)}\n`;
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
        return this.templateForName(templateName).then((template) => {
            return template.info();
        });
    }

    /**
     *
     * @param name
     * @returns {Promise<{Template}>}
     */
    templateForName(name) {
        const capturedThis = this;
        return new Promise(function (resolve, reject) {
            let chosenTemplate = undefined;
            capturedThis.templates.forEach((template) => {
                if (template.name === name) chosenTemplate = template;
            });

            if (!chosenTemplate) reject("Template not found in package");
            resolve(chosenTemplate);
        });
    }

    /**
     * Delete the package and all its dependencies
     * Steps:
     * 1. Delete all dependencies
     * 2. Delete the workflow template
     * 3. Delete the config maps
     * @returns {Promise<{response: http.IncomingMessage, body: object}>}
     */
    delete(cluster, namespace) {
        const capturedThis = this;
        return this.dependencies(cluster)
            .then((dependencyPackages) => {
                return Promise.each(dependencyPackages, function (dependencyPackage) {
                    console.log(`Deleting dependent package ${dependencyPackage.info.name}`);
                    return dependencyPackage.delete(cluster, namespace);
                });
            })
            .then((_) => {
                console.log(`Deleting config maps for package ${this.metadata.name}`);
                return capturedThis.deleteConfigMaps(namespace);
            })
            .then((_) => {
                console.log(`Deleting secrets for package ${this.metadata.name}`);
                return capturedThis.deleteSecrets(namespace);
            })
            .then((_) => {
                console.log(`Deleting pipelines for package ${this.metadata.name}`);
                return capturedThis.deletePipelines(namespace);
            })
            .then((_) => {
                console.log(`Deleting cronworkflows for package ${this.metadata.name}`);
                return capturedThis.deleteCronWorkflows(namespace);
            })
            .then((_) => {
                console.log(`Deleting templates for package ${this.metadata.name}`);
                var kind = constants.ARGO_WORKFLOW_TEMPLATES_KIND;
                var plural = `${kind.toLowerCase()}s`;

                if (cluster) {
                    kind = constants.ARGO_CLUSTER_WORKFLOW_TEMPLATES_KIND;
                    plural = `${kind.toLowerCase()}s`;
                    return customK8sApi.deleteClusterCustomObject(
                        constants.ARGO_K8S_API_GROUP,
                        constants.ARGO_K8S_API_VERSION,
                        plural,
                        capturedThis.metadata.name
                    );
                }
                return customK8sApi.deleteNamespacedCustomObject(
                    constants.ARGO_K8S_API_GROUP,
                    constants.ARGO_K8S_API_VERSION,
                    capturedThis.metadata.namespace,
                    plural,
                    capturedThis.metadata.name
                );
            });
    }

    /**
     * Get all dependencies of the packages installed
     * @param {Boolean} cluster
     * @returns {Promise<[Package]>}
     */
    dependencies(cluster) {
        var kind = constants.ARGO_WORKFLOW_TEMPLATES_KIND;
        var plural = `${kind.toLowerCase()}s`;

        if (cluster) {
            kind = constants.ARGO_CLUSTER_WORKFLOW_TEMPLATES_KIND;
            plural = `${kind.toLowerCase()}s`;
            return customK8sApi
                .listClusterCustomObject(
                    constants.ARGO_K8S_API_GROUP,
                    constants.ARGO_K8S_API_VERSION,
                    plural,
                    null,
                    null,
                    null,
                    null,
                    this.info.getDependencyLabel()
                )
                .then((response) => {
                    return this.getDependentPackagesFromListResponse(response);
                });
        }
        return customK8sApi
            .listNamespacedCustomObject(
                constants.ARGO_K8S_API_GROUP,
                constants.ARGO_K8S_API_VERSION,
                this.metadata.namespace,
                plural,
                null,
                null,
                null,
                null,
                this.info.getDependencyLabel()
            )
            .then((response) => {
                return this.getDependentPackagesFromListResponse(response);
            });
    }

    /**
     * Get all dependencies
     * @returns {Promise<[Package]>}
     */
    getDependentPackagesFromListResponse(response) {
        let packages = [];
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
     * @returns {Promise<Array<V1ConfigMap>>}
     */
    configMaps(namespace) {
        return coreK8sApi
            .listNamespacedConfigMap(namespace, null, null, null, null, this.info.getPackageLabel())
            .then((response) => {
                return response.body.items;
            });
    }

    /**
     * Deletes all configmaps associated with the package
     * @returns {Promise<Any>}
     */
    deleteConfigMaps(namespace) {
        return this.configMaps(namespace).then((configMaps) => {
            return Promise.each(configMaps, function (configMap) {
                const metadata = configMap.metadata;
                return coreK8sApi.deleteNamespacedConfigMap(metadata.name, metadata.namespace);
            });
        });
    }

    /**
     * Returns all secrets associated with the package
     * @returns {Promise<Array<V1Secret>>}
     */
    secrets(namespace) {
        return coreK8sApi
            .listNamespacedSecret(namespace, null, null, null, null, this.info.getPackageLabel())
            .then((response) => {
                return response.body.items;
            });
    }

    /**
     * Deletes all secrets associated with the package
     * @returns {Promise<Any>}
     */
    deleteSecrets(namespace) {
        return this.secrets(namespace).then((secrets) => {
            return Promise.each(secrets, function (secret) {
                const metadata = secret.metadata;
                return coreK8sApi.deleteNamespacedSecret(metadata.name, metadata.namespace);
            });
        });
    }

    /**
     * Returns all piplines associated with the package
     * @returns {Promise<Array<Object>>}
     */
    pipelines(namespace) {
        let plural = `${constants.ARGO_DATAFLOW_KIND.toLowerCase()}s`;
        return customK8sApi
            .listNamespacedCustomObject(
                constants.ARGO_DATAFLOW_K8S_API_GROUP,
                constants.ARGO_K8S_API_VERSION,
                namespace,
                plural,
                null,
                null,
                null,
                null,
                this.info.getPackageLabel()
            )
            .then((response) => {
                return response.body.items;
            });
    }

    /**
     * Deletes all pipelines associated with the package
     * @returns {Promise<Any>}
     */
    deletePipelines(namespace) {
        let plural = `${constants.ARGO_DATAFLOW_KIND.toLowerCase()}s`;
        return this.pipelines(namespace).then((pipelines) => {
            return Promise.each(pipelines, function (pipeline) {
                const metadata = pipeline.metadata;
                return customK8sApi.deleteNamespacedCustomObject(
                    constants.ARGO_DATAFLOW_K8S_API_GROUP,
                    constants.ARGO_K8S_API_VERSION,
                    metadata.namespace,
                    plural,
                    metadata.name
                );
            });
        });
    }

    /**
     * Returns all cron workflows associated with the package
     * @returns {Promise<Array<CronWorkflow>>}
     */
    cronWorkflows(namespace) {
        let plural = `${constants.ARGO_CRON_WORKFLOW_KIND.toLowerCase()}s`;
        return customK8sApi
            .listNamespacedCustomObject(
                constants.ARGO_K8S_API_GROUP,
                constants.ARGO_K8S_API_VERSION,
                namespace,
                plural,
                null,
                null,
                null,
                null,
                this.info.getPackageLabel()
            )
            .then((response) => {
                return response.body.items;
            });
    }

    /**
     * Deletes cronworkflows associated with the package
     * @returns {Promise<Any>}
     */
    deleteCronWorkflows(namespace) {
        let plural = `${constants.ARGO_CRON_WORKFLOW_KIND.toLowerCase()}s`;
        return this.cronWorkflows(namespace).then((cronWorkflows) => {
            return Promise.each(cronWorkflows, function (cronWorkflow) {
                const metadata = cronWorkflow.metadata;
                return customK8sApi.deleteNamespacedCustomObject(
                    constants.ARGO_K8S_API_GROUP,
                    constants.ARGO_K8S_API_VERSION,
                    metadata.namespace,
                    plural,
                    metadata.name
                );
            });
        });
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
    run(args, serviceAccountName, imagePullSecrets, cluster, namespace) {
        if (!this.isExecutable) {
            throw "Package is not runnable";
        }

        const runtimeArguments = new Argument(args);
        const capturedThis = this;
        return this.arguments
            .checkRequiredArgs(runtimeArguments)
            .then((_) => {
                return fs.readFileAsync(`${__dirname}/../static/workflows/workflow.yaml`);
            })
            .then((data) => {
                return yaml.load(data);
            })
            .then((workflow) => {
                const name = capturedThis.metadata.name;
                workflow.metadata.generateName = `${name}-`;
                if (serviceAccountName) workflow.spec.serviceAccountName = serviceAccountName;
                if (imagePullSecrets) workflow.spec.imagePullSecrets = [{ name: imagePullSecrets }];
                workflow.spec.workflowTemplateRef.name = name;
                workflow.spec.workflowTemplateRef.clusterScope = cluster;
                workflow.spec.arguments = runtimeArguments;
                return workflow;
            })
            .then((workflow) => {
                return customK8sApi.createNamespacedCustomObject(
                    constants.ARGO_K8S_API_GROUP,
                    constants.ARGO_K8S_API_VERSION,
                    namespace,
                    constants.ARGO_WORKFLOWS_PLURAL,
                    workflow
                );
            });
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
    runTemplate(templateName, args, serviceAccountName, imagePullSecrets, cluster, namespace) {
        const capturedThis = this;
        return this.templateForName(templateName)
            .then((template) => {
                return template.generateWorkflow(
                    capturedThis.metadata.name,
                    args,
                    serviceAccountName,
                    imagePullSecrets,
                    cluster
                );
            })
            .then((workflow) => {
                return customK8sApi.createNamespacedCustomObject(
                    constants.ARGO_K8S_API_GROUP,
                    constants.ARGO_K8S_API_VERSION,
                    namespace,
                    constants.ARGO_WORKFLOWS_PLURAL,
                    workflow
                );
            });
    }
}

/**
 * Get Installer label
 * @returns {string}
 */
Package.getInstallerLabel = function () {
    return `${constants.ARGOPM_INSTALLER_LABEL}=${constants.ARGOPM_INSTALLER_LABEL_VALUE}`;
};

/**
 * Get install package
 * @param {String} namespace
 * @param {String} packageName
 * @param {Boolean} cluster
 * @returns {Promise<Package>}
 */
Package.info = function (namespace, packageName, cluster) {
    var plural = `${constants.ARGO_WORKFLOW_TEMPLATES_KIND.toLowerCase()}s`;
    if (cluster) {
        plural = `${constants.ARGO_CLUSTER_WORKFLOW_TEMPLATES_KIND.toLowerCase()}s`;
        return customK8sApi
            .listClusterCustomObject(
                constants.ARGO_K8S_API_GROUP,
                constants.ARGO_K8S_API_VERSION,
                plural,
                null,
                null,
                null,
                null,
                PackageInfo.getPackageLabel(packageName)
            )
            .then((response) => {
                const items = response.body.items;
                if (items.length !== 1) {
                    throw new Error(`${packageName} not found`);
                }
                return new Package(items[0]);
            });
    }
    return customK8sApi
        .listNamespacedCustomObject(
            constants.ARGO_K8S_API_GROUP,
            constants.ARGO_K8S_API_VERSION,
            namespace,
            plural,
            null,
            null,
            null,
            null,
            PackageInfo.getPackageLabel(packageName)
        )
        .then((response) => {
            const items = response.body.items;
            if (items.length !== 1) {
                throw new Error(`${packageName} not found in namespace ${namespace}`);
            }
            return new Package(items[0]);
        });
};

/**
 * Get all installed packages in the namespace
 * @param {String} namespace
 * @param {Boolean} cluster
 * @returns {Promise<[Package]>}
 */
Package.list = function (namespace, cluster) {
    var plural = `${constants.ARGO_WORKFLOW_TEMPLATES_KIND.toLowerCase()}s`;

    if (cluster) {
        plural = `${constants.ARGO_CLUSTER_WORKFLOW_TEMPLATES_KIND.toLowerCase()}s`;
        return customK8sApi
            .listClusterCustomObject(
                constants.ARGO_K8S_API_GROUP,
                constants.ARGO_K8S_API_VERSION,
                plural,
                null,
                null,
                null,
                null,
                Package.getInstallerLabel()
            )
            .then((response) => {
                return handleListResponse(response);
            });
    }
    return customK8sApi
        .listNamespacedCustomObject(
            constants.ARGO_K8S_API_GROUP,
            constants.ARGO_K8S_API_VERSION,
            namespace,
            plural,
            null,
            null,
            null,
            null,
            Package.getInstallerLabel()
        )
        .then((response) => {
            return handleListResponse(response);
        });
};

/**
 * Handle k8s list response
 * @returns {Promise<[Package]>}
 */
function handleListResponse(response) {
    let packages = [];
    response.body.items.forEach((template) => {
        packages.push(new Package(template));
    });
    return packages;
}

exports.Package = Package;
