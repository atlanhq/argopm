// ./lib/k8s.js
const Promise = require("bluebird");
const fs = Promise.promisifyAll(require("fs"));
const yaml = require("js-yaml");
const k8s = require('@kubernetes/client-node');
const kc = new k8s.KubeConfig();
kc.loadFromDefault();

const customK8sApi = kc.makeApiClient(k8s.CustomObjectsApi);
const coreK8sApi = kc.makeApiClient(k8s.CoreV1Api);

const ARGO_K8S_API_GROUP = "argoproj.io"
const ARGO_K8S_API_VERSION = "v1alpha1"
const ARGO_WORKFLOW_TEMPLATES_PLURAL = "workflowtemplates"

const APM_LIBRARY_NAME_LABEL = "org.apm.package.name"
const APM_LIBRARY_VERSION_LABEL = "org.apm.package.version"
const APM_LIBRARY_PARENT_LABEL = "org.apm.package.parent"
const APM_LIBRARY_REGISTRY_LABEL = "org.apm.package.registry"

const APM_INSTALLER_LABEL = "org.apm.package.installer"
const APM_INSTALLER_LABEL_VALUE = "apm"


/**
 * Encode a string
 * @param {String} str
 */
const encode = function (str) {
    return str.replace(/@/g, "a-t-r").replace(/\//g, "s-l-a-s-h").replace(/:/g, "c-o-l-o-n")
}

/**
 * Decode a string
 * @param {String} str
 */
const decode = function (str) {
    return str.replace(/a-t-r/g, "@").replace(/s-l-a-s-h/g, "/").replace(/c-o-l-o-n/g, ":")
}

/**
 * List all installed packages in the namespace
 * @param {String} namespace
 */
const listInstalledPackages = function (namespace) {
    const labelSelector = `${APM_INSTALLER_LABEL}=${APM_INSTALLER_LABEL_VALUE}`;
    return customK8sApi.listNamespacedCustomObject(ARGO_K8S_API_GROUP, ARGO_K8S_API_VERSION, namespace,
        ARGO_WORKFLOW_TEMPLATES_PLURAL, true, null, null, labelSelector ).then(response => {
        response.body.items.forEach(template => {
            console.log(`${decode(template.metadata.labels[APM_LIBRARY_NAME_LABEL])} ${decode(template.metadata.labels[APM_LIBRARY_VERSION_LABEL])}`)
        })
    })
}

exports.listInstalledPackages = listInstalledPackages;


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
        var mainThis = this;
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

        metadata.labels[APM_INSTALLER_LABEL] = APM_INSTALLER_LABEL_VALUE;
        metadata.labels[APM_LIBRARY_NAME_LABEL] = encode(this.package.name);
        metadata.labels[APM_LIBRARY_VERSION_LABEL] = encode(this.package.version);
        metadata.labels[APM_LIBRARY_PARENT_LABEL] = encode(this.parentPackage);
        metadata.labels[APM_LIBRARY_REGISTRY_LABEL] = encode(this.registry);
        yamlObject.metadata = metadata;
        return yamlObject;
    }

}


exports.K8sInstaller = K8sInstaller;