'use strict';
const { yellow, blue, lightCyan } = require ('ansicolor');
const constants = require("../constants").constants;

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


class PackageInfo {

    /**
     * Create package info object
     * @param {Object} labels K8s labels
     */
    constructor(labels) {
        if (labels[constants.ARGOPM_INSTALLER_LABEL] !== constants.ARGOPM_INSTALLER_LABEL_VALUE) {
            throw "Not a ArgoPM package";
        }

        this.name = decode(labels[constants.ARGOPM_LIBRARY_NAME_LABEL]);
        this.version = decode(labels[constants.ARGOPM_LIBRARY_VERSION_LABEL]);
        this.parent = decode(labels[constants.ARGOPM_LIBRARY_PARENT_LABEL]);
        this.registry = decode(labels[constants.ARGOPM_LIBRARY_REGISTRY_LABEL]);
    }

    info() {
        let info = blue(`Package Info:\n`);
        info += yellow(`Name: ${lightCyan(this.name)}\n`);
        info += yellow(`Version: ${lightCyan(this.version)}\n`);
        info += yellow(`Parent Dependency: ${lightCyan(this.parent)}\n`);
        info += yellow(`Package Registry: ${lightCyan(this.registry)}\n`);
        return info;
    }

    /**
     * Get Dependency label
     * @returns {string}
     */
    getDependencyLabel () {
        const parentName = encode(`${this.name}@${this.version}`);
        return `${constants.ARGOPM_LIBRARY_PARENT_LABEL}=${parentName}`;
    }

    /**
     * Get Package label
     * @returns {string}
     */
    getPackageLabel () {
        return `${constants.ARGOPM_LIBRARY_NAME_LABEL}=${encode(this.name)}`;
    }
}

/**
 * Create the K8s labels object
 * @param {String} name
 * @param {String} version
 * @param {String} parent
 * @param {String} registry
 */
PackageInfo.createK8sLabels = function (name, version, parent, registry) {
    let labels = {};
    labels[constants.ARGOPM_INSTALLER_LABEL] = encode(constants.ARGOPM_INSTALLER_LABEL_VALUE);
    labels[constants.ARGOPM_LIBRARY_NAME_LABEL] = encode(name);
    labels[constants.ARGOPM_LIBRARY_VERSION_LABEL] = encode(version);
    labels[constants.ARGOPM_LIBRARY_PARENT_LABEL] = encode(parent);
    labels[constants.ARGOPM_LIBRARY_REGISTRY_LABEL] = encode(registry);
    return labels;
}

exports.PackageInfo = PackageInfo;