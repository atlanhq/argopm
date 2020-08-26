'use strict';
const PackageInfo = require("./info").PackageInfo;
const constants = require("../constants").constants;

const k8s = require('@kubernetes/client-node');
const kc = new k8s.KubeConfig();
kc.loadFromDefault();

const customK8sApi = kc.makeApiClient(k8s.CustomObjectsApi);
const coreK8sApi = kc.makeApiClient(k8s.CoreV1Api);

class Package {

    /**
     * Create an Argo Package object
     * @param {Object} k8sYaml
     */
    constructor(k8sYaml) {
        this.info = new PackageInfo(k8sYaml.metadata.labels);
        this.metdata = k8sYaml.metadata;
    }

    /**
     * Delete the package
     * @returns {Promise<{response: http.IncomingMessage, body: object}>}
     */
    delete() {
        return customK8sApi.deleteCollectionNamespacedCustomObject_2(constants.ARGO_K8S_API_GROUP,
            constants.ARGO_K8S_API_VERSION, this.metadata.namespace, constants.ARGO_WORKFLOW_TEMPLATES_PLURAL,
            this.metdata.name
        )
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
 * @returns {Promise<Package>}
 */
Package.getInstalledPackage = function (namespace, packageName) {
    return customK8sApi.getNamespacedCustomObject(constants.ARGO_K8S_API_GROUP, constants.ARGOPM_LIBRARY_VERSION_LABEL,
        namespace, constants.ARGO_WORKFLOW_TEMPLATES_PLURAL, packageName).then(response => {
        return new Package(response.body);
    });
}

/**
 * Get all installed packages in the namespace
 * @param namespace
 * @returns {Promise<[Package]>}
 */
Package.listInstalledPackages = function (namespace) {
    return customK8sApi.listNamespacedCustomObject(constants.ARGO_K8S_API_GROUP, constants.ARGO_K8S_API_VERSION,
        namespace, constants.ARGO_WORKFLOW_TEMPLATES_PLURAL, null, null, null,
        Package.getInstallerLabel()).then(response => {
        let packages = [];
        response.body.items.forEach(template => {
            packages.push(new Package(template));
        })
        return packages;
    })
}

exports.Package = Package;