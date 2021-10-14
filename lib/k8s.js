// ./lib/k8s.js
const constants = require("./constants").constants;
const Promise = require("bluebird");
const fs = Promise.promisifyAll(require("fs"));
const yaml = require("js-yaml");
const PackageInfo = require("./models/info").PackageInfo;
const k8s = require('@kubernetes/client-node');
const kc = new k8s.KubeConfig();
kc.loadFromDefault();

const customK8sApi = kc.makeApiClient(k8s.CustomObjectsApi);
const coreK8sApi = kc.makeApiClient(k8s.CoreV1Api);


class K8sInstaller {
    /**
     * Installs the given package to Argo K8s deployment
     *
     * @param {String} packagePath Argo package path
     * @param {String} namespace Namespace to install the package in
     * @param {String} parentPackage Parent package of the format <packagename>@<version>
     * @param {String} registry Package registry
     */
    constructor(packagePath, namespace, parentPackage, registry, options) {
        this.packagePath = packagePath;
        this.namespace = namespace;
        this.parentPackage = parentPackage;
        this.registry = registry;
        this.package = JSON.parse(fs.readFileSync(`${this.packagePath}/package.json`, 'utf-8'));
        this.cronString = options.cronString
        this.timeZone = options.timeZone
    }

    /**
     * Installs the given package to Argo K8s deployment
     * @param {boolean} cluster
     */
    install(cluster) {
        const mainThis = this;
        return this.installConfigs().then(_ => {
            return mainThis.installSecrets();
        }).then(_ => {
            return mainThis.installPipelines();
        }).then(_ => {
            return mainThis.installTemplates(cluster);
        }).then ( _ => {
            return mainThis.installCronWorkflows(cluster);
        })
    }

    /**
     * Installs the config maps
     */
    installConfigs() {
        const dirPath = `${this.packagePath}/configmaps/`
        return this.installYamlInPath(dirPath, false, constants.CONFIGMAP_KIND, '', this.upsertConfigMap);
    }

    /**
     * Installs secrets
     */
     installSecrets() {
        const dirPath = `${this.packagePath}/secrets/`
        return this.installYamlInPath(dirPath, false, constants.SECERT_KIND, '', this.upsertSecret);
    }

    /**
     * Installs cron workflows
     * @param {boolean} cluster
     */
    installCronWorkflows(cluster) {
        const dirPath = `${this.packagePath}/cronworkflows/`
        return this.installYamlInPath(dirPath, cluster, constants.ARGO_CRON_WORKFLOW_KIND, constants.ARGO_K8S_API_GROUP, this.upsertTemplate);
    }

    /**
     * Installs data pipelines
     */
     installPipelines() {
        const dirPath = `${this.packagePath}/pipelines/`
        return this.installYamlInPath(dirPath, false, constants.ARGO_DATAFLOW_KIND, constants.ARGO_DATAFLOW_K8S_API_GROUP, this.upsertTemplate);
    }

    /**
     * Installs the templates
     * @param {boolean} cluster
     */
    installTemplates(cluster) {
        const dirPath = `${this.packagePath}/templates/`
        var kind = constants.ARGO_WORKFLOW_TEMPLATES_KIND
        if (cluster) {
            kind = constants.ARGO_CLUSTER_WORKFLOW_TEMPLATES_KIND
        }
        return this.installYamlInPath(dirPath, cluster, kind, constants.ARGO_K8S_API_GROUP, this.upsertTemplate);
    }

    /**
     * Install all YAML files in path
     * @param {String} dirPath
     * @param {boolean} cluster
     * @param {string} kind
     * @param {string} group
     * @param {Function} fn
     */
    installYamlInPath = function (dirPath, cluster, kind, group, fn) {
        if (!fs.existsSync(dirPath)) {
            return Promise.resolve(false);
        }

        var mainThis = this;
        return fs.readdirAsync(dirPath).then(files => {
            return Promise.each(files, function (file) {
                const filePath = `${dirPath}${file}`;
                return fs.readFileAsync(filePath, 'utf8').then(data => {
                    return yaml.safeLoad(data)
                }).then(yamlData => {
                    if (!yamlData) return
                    const apmYAML = mainThis.addAPMLabels(yamlData);
                    return fn(mainThis.package.name, mainThis.namespace, kind, group, apmYAML, cluster);
                })
            })
        })
    }

    /**
     * Insert or update configmaps
     * @param {string} packageName 
     * @param {string} namespace 
     * @param {string} kind
     * @param {string} group
     * @param {object} yamlObject 
     * @param {boolean} cluster
     */
    upsertConfigMap(packageName, namespace, kind, group, yamlObject, cluster) {
        const name = yamlObject.metadata.name
        return coreK8sApi.listNamespacedConfigMap(namespace, null, null, null, null, PackageInfo.getPackageLabel(packageName)).then(response => {
            const items = response.body.items;
            let isPresent = false;
            items.forEach(item => {
                if (item.metadata.name === name) {
                    isPresent = true
                    return
                }
            })

            if (isPresent) {
                console.debug(`${name} config map already present in the cluster. Updating it.`)
                return coreK8sApi.patchNamespacedConfigMap(name, namespace, yamlObject, undefined, undefined, undefined, undefined, {headers: { 'content-type': 'application/strategic-merge-patch+json' }})
            }
            return coreK8sApi.createNamespacedConfigMap(namespace, yamlObject);
        })
    }

    /**
     * Insert or update secret
     * @param {string} packageName 
     * @param {string} namespace 
     * @param {string} kind
     * @param {string} group
     * @param {object} yamlObject 
     * @param {boolean} cluster
     */
     upsertSecret(packageName, namespace, kind, group, yamlObject, cluster) {
        const name = yamlObject.metadata.name;
        return coreK8sApi.listNamespacedSecret(namespace, null, null, null, null, PackageInfo.getPackageLabel(packageName)).then(response => {
            const items = response.body.items;
            let isPresent = false;
            items.forEach(item => {
                if (item.metadata.name === name) {
                    isPresent = true
                    return
                }
            })

            if (isPresent) {
                console.debug(`${name} secret already present in the cluster. Updating it.`)
                return coreK8sApi.patchNamespacedSecret(name, namespace, yamlObject, undefined, undefined, undefined, undefined, {headers: { 'content-type': 'application/strategic-merge-patch+json' }})
            }
            return coreK8sApi.createNamespacedSecret(namespace, yamlObject);
        })
    }

    /**
     * Insert or update the template
     * @param {string} packageName 
     * @param {string} namespace 
     * @param {string} kind
     * @param {string} group
     * @param {object} yamlObject 
     * @param {boolean} cluster
     */
    upsertTemplate(packageName, namespace, kind, group, yamlObject, cluster) {
        let plural = `${kind.toLowerCase()}s`

        if (!cluster) {
            return customK8sApi.listNamespacedCustomObject(group, constants.ARGO_K8S_API_VERSION, namespace, plural, 
                null, null, null, PackageInfo.getPackageLabel(packageName)).then(response => {
                    return K8sInstaller.handleTemplateResponse(response, namespace, plural, yamlObject, cluster, group)
            })
        }
        return customK8sApi.listClusterCustomObject(group, constants.ARGO_K8S_API_VERSION, plural, 
            null, null, null, PackageInfo.getPackageLabel(packageName)).then(response => {
                yamlObject['kind'] = kind
                var clusterInstall = cluster

                if (kind == constants.ARGO_CRON_WORKFLOW_KIND) {
                    yamlObject['spec']['workflowSpec']['workflowTemplateRef']['clusterScope'] = cluster
                    clusterInstall = false
                }
                else {
                    var templateIndex = -1;
                    if (yamlObject['spec']['templates']) {
                        yamlObject['spec']['templates'].forEach(template => {
                            templateIndex += 1
                            if (template['dag']) {
                                var taskIndex = -1
                                template['dag']['tasks'].forEach(task => {
                                    taskIndex += 1
                                    if (task['templateRef']) {
                                        yamlObject['spec']['templates'][templateIndex]['dag']['tasks'][taskIndex]['templateRef']['clusterScope'] = true
                                    }
                                })
                            }
                        })
                    }
                }
                return K8sInstaller.handleTemplateResponse(response, namespace, plural, yamlObject, clusterInstall, group)
        })
    }
    
    static handleTemplateResponse(response, namespace, plural, yamlObject, cluster, apiGroup) {
        const name = yamlObject.metadata.name;
        const items = response.body.items;
        let isPresent = false;
        items.forEach(item => {
            if (item.metadata.name === name) {
                isPresent = true
                return
            }
        })

        if (isPresent) {
            console.debug(`${name} already present in the cluster. Updating it.`)
            if (cluster) {
                return customK8sApi.patchClusterCustomObject(apiGroup, constants.ARGO_K8S_API_VERSION, plural, name, yamlObject, undefined, undefined, undefined, {headers: { 'content-type': 'application/merge-patch+json' }})
            }
            return customK8sApi.patchNamespacedCustomObject(apiGroup, constants.ARGO_K8S_API_VERSION, namespace, plural, name, yamlObject, undefined, undefined, undefined, {headers: { 'content-type': 'application/merge-patch+json' }})
        }

        if (cluster) {
            return customK8sApi.createClusterCustomObject(apiGroup, constants.ARGO_K8S_API_VERSION, plural, yamlObject);
        }
        return customK8sApi.createNamespacedCustomObject(apiGroup, constants.ARGO_K8S_API_VERSION, namespace, plural, yamlObject);
    }

    /**
     * Installs the given package to Argo K8s deployment
     * @param {Object} yamlObject YAML object
     */
    addAPMLabels(yamlObject) {
        let metadata = yamlObject.metadata;
        if (metadata.labels === undefined) {
            metadata.labels = {};
        }

        const argoPMLabels = PackageInfo.createK8sLabels(this.package.name, this.package.version, this.parentPackage, this.registry)
        Object.keys(argoPMLabels).forEach(function(key) { metadata.labels[key] = argoPMLabels[key]; });

        yamlObject.metadata = metadata;
        return yamlObject;
    }

}


exports.K8sInstaller = K8sInstaller;