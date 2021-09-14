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

const ARGO_K8S_API_GROUP = "argoproj.io"
const ARGO_K8S_API_VERSION = "v1alpha1"

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
            return mainThis.installTemplates(cluster);
        }).then(_ => {
            return mainThis.installCronWorkflows();
        })
    }

    /**
     * Installs the config maps
     */
    installConfigs() {
        const dirPath = `${this.packagePath}/configmaps/`
        return this.installYamlInPath(dirPath);
    }

    /**
     * Installs cron workflows
     */
    installCronWorkflows() {
        const dirPath = `${this.packagePath}/cronworkflows/`
        return this.installYamlInPath(dirPath);
    }

    /**
     * Installs the templates
     * @param {boolean} cluster
     */
    installTemplates(cluster) {
        const dirPath = `${this.packagePath}/templates/`
        return this.installYamlInPath(dirPath, cluster);
    }

    /**
     * Install all YAML files in path
     * @param {String} dirPath
     * @param {boolean} cluster
     */
    installYamlInPath = function (dirPath, cluster) {
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
                    const apmYAML = mainThis.addAPMLabels(yamlData);
                    var kind = apmYAML['kind'].toLowerCase();
                    var plural = `${kind}s`
                    if (kind === "configmap") {
                        return mainThis.upsertConfigMap(mainThis.namespace, apmYAML, mainThis.package.name);
                    }

                    if (cluster && kind.includes("template")) {
                        apmYAML['kind'] = 'ClusterWorkflowTemplate'
                        kind = apmYAML['kind'].toLowerCase();
                        plural = `${kind}s`
                    }

                    if (kind == "cronworkflow") {
                        if (mainThis.cronString) apmYAML['spec']['schedule'] = mainThis.cronString
                        if (mainThis.timeZone) apmYAML['spec']['timezone'] = mainThis.timeZone
                    }

                    return mainThis.upsertTemplate(mainThis.namespace, plural, apmYAML, mainThis.package.name, cluster);
                })
            })
        })
    }

    /**
     * Insert or update the config map
     * @param {string} namespace 
     * @param {object} yamlObject 
     * @param {string} packageName
     */
    upsertConfigMap(namespace, yamlObject, packageName) {
        const name = yamlObject.metadata.name;
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
                console.debug(`${name} already present in the cluster. Updating it.`)
                return coreK8sApi.patchNamespacedConfigMap(name, namespace, yamlObject, undefined, undefined, undefined, undefined, {headers: { 'content-type': 'application/strategic-merge-patch+json' }})
            }
            return coreK8sApi.createNamespacedConfigMap(namespace, yamlObject);
        })
    }

    /**
     * Insert or update the template
     * @param {string} namespace 
     * @param {string} plural 
     * @param {object} yamlObject 
     * @param {string} packageName
     * @param {boolean} cluster
     */
    upsertTemplate(namespace, plural, yamlObject, packageName, cluster) {
        var mainThis = this

        var K8S_API_GROUP = ARGO_K8S_API_GROUP;
        if(yamlObject['kind'] == "Pipeline") {
            K8S_API_GROUP = constants.ARGO_DATAFLOW_K8S_API_GROUP
        }

        if (!cluster) {
            return customK8sApi.listNamespacedCustomObject(K8S_API_GROUP, ARGO_K8S_API_VERSION, namespace, plural, 
                null, null, null, PackageInfo.getPackageLabel(packageName)).then(response => {
                    return mainThis.handleTemplateResponse(response, namespace, plural, yamlObject, cluster, K8S_API_GROUP)
            })
        }
        return customK8sApi.listClusterCustomObject(K8S_API_GROUP, ARGO_K8S_API_VERSION, plural, 
            null, null, null, PackageInfo.getPackageLabel(packageName)).then(response => {
                var templateIndex = -1;
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
                return mainThis.handleTemplateResponse(response, namespace, plural, yamlObject, cluster, K8S_API_GROUP)
        })
    }

    handleTemplateResponse(response, namespace, plural, yamlObject, cluster, apiGroup) {
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
                return customK8sApi.patchClusterCustomObject(apiGroup, ARGO_K8S_API_VERSION, plural, name, yamlObject, undefined, undefined, undefined, {headers: { 'content-type': 'application/merge-patch+json' }})
            }
            return customK8sApi.patchNamespacedCustomObject(apiGroup, ARGO_K8S_API_VERSION, namespace, plural, name, yamlObject, undefined, undefined, undefined, {headers: { 'content-type': 'application/merge-patch+json' }})
        }

        if (cluster) {
            return customK8sApi.createClusterCustomObject(apiGroup, ARGO_K8S_API_VERSION, plural, yamlObject);
        }
        return customK8sApi.createNamespacedCustomObject(apiGroup, ARGO_K8S_API_VERSION, namespace, plural, yamlObject);
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