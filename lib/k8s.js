// ./lib/k8s.js
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
    constructor(packagePath, namespace, parentPackage, registry) {
        this.packagePath = packagePath;
        this.namespace = namespace;
        this.parentPackage = parentPackage;
        this.registry = registry;
        this.package = JSON.parse(fs.readFileSync(`${this.packagePath}/package.json`, 'utf-8'));
    }

    /**
     * Installs the given package to Argo K8s deployment
     */
    install() {
        const mainThis = this;
        return this.installConfigs().then(_ => {
            return mainThis.installTemplates();
        });
    }

    /**
     * Installs the config maps
     */
    installConfigs() {
        const dirPath = `${this.packagePath}/configmaps/`
        return this.installYamlInPath(dirPath);
    }

    /**
     * Installs the templates
     */
    installTemplates() {
        const dirPath = `${this.packagePath}/templates/`
        return this.installYamlInPath(dirPath);
    }

    /**
     * Install all YAML files in path
     * @param {String} dirPath
     */
    installYamlInPath = function (dirPath) {
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
                    const kind = apmYAML['kind'].toLowerCase();
                    const plural = `${kind}s`
                    if (kind === "configmap") {
                        return coreK8sApi.createNamespacedConfigMap(mainThis.namespace, apmYAML);
                    }
                    return customK8sApi.createNamespacedCustomObject(ARGO_K8S_API_GROUP, ARGO_K8S_API_VERSION, mainThis.namespace, plural, apmYAML);
                })
            })
        })
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