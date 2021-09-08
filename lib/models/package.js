'use strict';
const constants = require("../constants").constants;
const Promise = require("bluebird");
const fs = Promise.promisifyAll(require("fs"));
const yaml = require("js-yaml");

const k8s = require('@kubernetes/client-node');
const kc = new k8s.KubeConfig();
kc.loadFromDefault();

const customK8sApi = kc.makeApiClient(k8s.CustomObjectsApi);
const coreK8sApi = kc.makeApiClient(k8s.CoreV1Api);

const PackageInfo = require("./info").PackageInfo;
const Argument = require('./argument').Argument;
const Template = require('./template').Template;
const {yellow, blue, bright, lightCyan} = require('ansicolor');

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
        this.k8sApiGroup = constants.ARGO_K8S_API_GROUP
        this.argoTemplatePlural = constants.ARGO_WORKFLOW_TEMPLATES_PLURAL

        if (k8sYaml.kind == "Pipeline") {
            this.k8sApiGroup = constants.ARGO_DATAFLOW_K8S_API_GROUP
            this.argoTemplatePlural = constants.ARGO_PIPELINES_PLURAL
        }
    }

    packageInfo() {
        let info = `${this.info.info()}\n`;

        info += `${yellow("Executable:")} ${lightCyan(this.isExecutable)}\n`

        info += `${this.arguments.info()}\n`

        let templatesInfo = blue(bright("Templates: \n"));
        this.templates.forEach(template => {
            templatesInfo += `- ${yellow(template.name)}\n`
        });
        info += templatesInfo;

        return info;
    }

    /**
     * @param {string} templateName
     */
    templateInfo(templateName) {
        return this.templateForName(templateName).then(template => {
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
        return new Promise(function(resolve, reject) {
            let chosenTemplate = undefined;
            capturedThis.templates.forEach(template => {
                if (template.name === name) chosenTemplate = template;
            })

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
    delete(cluster) {
        const capturedThis = this;
        return this.dependencies(cluster).then(dependencyPackages => {
            return Promise.each(dependencyPackages, function (dependencyPackage) {
                console.log(`Deleting dependent package ${dependencyPackage.info.name}`)
                return dependencyPackage.delete(cluster)
            });
        }).then(_ => {
            if (cluster) {
                return customK8sApi.deleteClusterCustomObject(constants.ARGO_K8S_API_GROUP, constants.ARGO_K8S_API_VERSION, 
                    constants.ARGO_CLUSTER_WORKFLOW_TEMPLATES_PLURAL, capturedThis.metadata.name
                );
            }
            return customK8sApi.deleteNamespacedCustomObject(capturedThis.k8sApiGroup,
                constants.ARGO_K8S_API_VERSION, capturedThis.metadata.namespace,
                capturedThis.argoTemplatePlural, capturedThis.metadata.name
            );
        }).then(_ => {
            if (cluster) return []
            return capturedThis.configMaps();
        }).then(configMaps => {
            if (cluster) return
            return Promise.each(configMaps, function (configMap) {
                const metadata = configMap.metadata;
                coreK8sApi.deleteNamespacedConfigMap(metadata.name, metadata.namespace);
            });
        })
    }

    /**
     * Get all dependencies of the packages installed
     * @param {Boolean} cluster
     * @returns {Promise<[Package]>}
     */
    dependencies(cluster) {
        if (cluster) {
            return customK8sApi.listClusterCustomObject(constants.ARGO_K8S_API_GROUP, constants.ARGO_K8S_API_VERSION,
                constants.ARGO_CLUSTER_WORKFLOW_TEMPLATES_PLURAL, null, null, null, this.info.getDependencyLabel()).then(response => {
                    return this.getDependentPackagesFromListResponse(response)
                })
        }
        return customK8sApi.listNamespacedCustomObject(this.k8sApiGroup, constants.ARGO_K8S_API_VERSION,
            this.metadata.namespace, this.argoTemplatePlural, null, null, null, this.info.getDependencyLabel()).then(response => {
            return this.getDependentPackagesFromListResponse(response)
        })
    }

    /**
     * Get all dependencies 
     * @returns {Promise<[Package]>}
     */
    getDependentPackagesFromListResponse(response) {
        let packages = [];
        response.body.items.forEach(template => {
            const argoPackage = new Package(template);
            if (argoPackage.info.name !== this.info.name) {
                packages.push(new Package(template));
            }
        })
        return packages;
    }

    /**
     * Returns all config maps associated with the package
     * @returns {Promise<Array<V1ConfigMap>>}
     */
    configMaps() {
        return coreK8sApi.listNamespacedConfigMap(this.metadata.namespace, null, null, null, null,
            this.info.getPackageLabel()).then(response => {
            return response.body.items;
        })
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
        return this.arguments.checkRequiredArgs(runtimeArguments).then(_ => {
            return fs.readFileAsync(`${__dirname}/../static/workflows/workflow.yaml`);
        }).then(data => {
            return yaml.safeLoad(data);
        }).then(workflow => {
            const name = capturedThis.metadata.name;
            workflow.metadata.generateName = `${name}-`;
            if (serviceAccountName) workflow.spec.serviceAccountName = serviceAccountName;
            if (imagePullSecrets) workflow.spec.imagePullSecrets = [{'name': imagePullSecrets}];
            workflow.spec.workflowTemplateRef.name = name;
            workflow.spec.workflowTemplateRef.clusterScope = cluster;
            workflow.spec.arguments = runtimeArguments;
            return workflow;
        }).then(workflow => {
            return customK8sApi.createNamespacedCustomObject(constants.ARGO_K8S_API_GROUP, constants.ARGO_K8S_API_VERSION,
                namespace, constants.ARGO_WORKFLOWS_PLURAL, workflow);
        })
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
        return this.templateForName(templateName).then(template => {
            return template.generateWorkflow(capturedThis.metadata.name, args, serviceAccountName, imagePullSecrets, cluster);
        }).then(workflow => {
            return customK8sApi.createNamespacedCustomObject(constants.ARGO_K8S_API_GROUP, constants.ARGO_K8S_API_VERSION,
                namespace, constants.ARGO_WORKFLOWS_PLURAL, workflow);
        })
    }
}

/**
 * Get Installer label
 * @returns {string}
 */
Package.getInstallerLabel = function () {
    return `${constants.ARGOPM_INSTALLER_LABEL}=${constants.ARGOPM_INSTALLER_LABEL_VALUE}`;
}

/**
 * Get install package
 * @param {String} namespace
 * @param {String} packageName
 * @param {Boolean} cluster
 * @returns {Promise<Package>}
 */
Package.info = function (namespace, packageName, cluster, isPipeline) {
    var K8S_API_GROUP = constants.ARGO_K8S_API_GROUP, ARGO_TEMPLATE_PLURAL = constants.ARGO_WORKFLOW_TEMPLATES_PLURAL;
    if (isPipeline) {
        K8S_API_GROUP = constants.ARGO_DATAFLOW_K8S_API_GROUP
        ARGO_TEMPLATE_PLURAL = constants.ARGO_PIPELINES_PLURAL
    } else if (cluster) {
        ARGO_TEMPLATE_PLURAL = constants.ARGO_CLUSTER_WORKFLOW_TEMPLATES_PLURAL
    }

    if (cluster) {
        return customK8sApi.listClusterCustomObject(constants.ARGO_K8S_API_GROUP, constants.ARGO_K8S_API_VERSION, 
            constants.ARGO_CLUSTER_WORKFLOW_TEMPLATES_PLURAL, null, null, null, PackageInfo.getPackageLabel(packageName)).then(response => {
                const items = response.body.items;
                if (items.length !== 1) {
                    throw new Error(`${packageName} not found`)
                }
                return new Package(items[0]);
        })
    }
    return customK8sApi.listNamespacedCustomObject(K8S_API_GROUP, constants.ARGO_K8S_API_VERSION, 
        namespace, ARGO_TEMPLATE_PLURAL, null, null, null, PackageInfo.getPackageLabel(packageName)).then(response => {
            const items = response.body.items;
            if (items.length !== 1) {
                throw new Error(`${packageName} not found in namespace ${namespace}`)
            }
            return new Package(items[0]);
    })
}

/**
 * Get all installed packages in the namespace
 * @param {String} namespace
 * @param {Boolean} cluster
 * @returns {Promise<[Package]>}
 */
Package.list = function (namespace, cluster, isPipeline) {
    var K8S_API_GROUP = constants.ARGO_K8S_API_GROUP, ARGO_TEMPLATE_PLURAL = constants.ARGO_WORKFLOW_TEMPLATES_PLURAL;

    if (isPipeline) {
        K8S_API_GROUP = constants.ARGO_DATAFLOW_K8S_API_GROUP
        ARGO_TEMPLATE_PLURAL = constants.ARGO_PIPELINES_PLURAL
    } else if (cluster) {
        ARGO_TEMPLATE_PLURAL = constants.ARGO_CLUSTER_WORKFLOW_TEMPLATES_PLURAL
    }

    if (cluster) {
        return customK8sApi.listClusterCustomObject(constants.ARGO_K8S_API_GROUP, constants.ARGO_K8S_API_VERSION, 
            constants.ARGO_CLUSTER_WORKFLOW_TEMPLATES_PLURAL, null, null, null, Package.getInstallerLabel()).then(response => {
            return handleListResponse(response);
        })
    }
    return customK8sApi.listNamespacedCustomObject(K8S_API_GROUP, constants.ARGO_K8S_API_VERSION,
        namespace, ARGO_TEMPLATE_PLURAL, null, null, null, Package.getInstallerLabel()).then(response => {
            return handleListResponse(response);
    })
}

/**
 * Handle k8s list response
 * @returns {Promise<[Package]>}
 */
function handleListResponse(response) {
    let packages = [];
    response.body.items.forEach(template => {
        packages.push(new Package(template));
    })
    return packages;
}

exports.Package = Package;