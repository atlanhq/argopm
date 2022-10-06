import { yellow, blue, lightCyan } from "ansicolor";
import { constants } from "../constants.mjs";

/**
 * Encode a string
 * @param {string} str
 */
export const encode = function (str: string) {
    return str.replace(/@/g, "-").replace(/\//g, "-").replace(/:/g, "-");
};

/**
 * Special encode a string
 * @param {string} str
 */
export const specialEncode = function (str: string) {
    if (str === ".") return "";
    return encode(str.replace(/@/g, "a-t-r").replace(/\//g, "s-l-a-s-h").replace(/:/g, "c-o-l-o-n"));
};

/**
 * Decode a string
 * @param {string} str
 */
export const decode = function (str: string) {
    return str
        .replace(/a-t-r/g, "@")
        .replace(/s-l-a-s-h/g, "/")
        .replace(/c-o-l-o-n/g, ":");
};

export type PackageObjectType = {
    config: {
        annotations: { [key: string]: string };
        labels: { [key: string]: string };
    };
    name: string;
    version: string;
    description: string;
    homepage: string;
    bugs: { email: string };
    author: { name: string };
    repository: { url: string };
    keywords: string[];
};

export class PackageInfo {
    name: string;
    version: string;
    parent: string;
    registry: string;

    /**
     * Create package info object
     * @param {Object} labels K8s labels
     */
    constructor(labels: { [x: string]: string }) {
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
    getDependencyLabel(): string {
        const parentName = encode(`${this.name}@${this.version}`);
        return `${constants.ARGOPM_LIBRARY_PARENT_LABEL}=${parentName}`;
    }

    /**
     * Get Package label
     * @returns {string}
     */
    getPackageLabel(): string {
        return `${constants.ARGOPM_LIBRARY_NAME_LABEL}=${encode(this.name)}`;
    }

    /**
     * Create the K8s labels object
     * @param {string} name
     * @param {string} version
     * @param {string} parent
     * @param {string} registry
     */
    static createK8sLabels = function (name: string, version: string, parent: string, registry: string) {
        const labels = {};
        labels[constants.ARGOPM_INSTALLER_LABEL] = encode(constants.ARGOPM_INSTALLER_LABEL_VALUE);
        labels[constants.ARGOPM_LIBRARY_NAME_LABEL] = specialEncode(name);
        labels[constants.ARGOPM_LIBRARY_VERSION_LABEL] = encode(version);
        labels[constants.ARGOPM_LIBRARY_PARENT_LABEL] = specialEncode(parent);
        labels[constants.ARGOPM_LIBRARY_REGISTRY_LABEL] = specialEncode(registry);
        return labels;
    };

    /**
     * Create the K8s labels objectx
     * @param {Object} packageObject
     * @param {string} parentPackageName
     * @param {string} registry
     */
    static createK8sLabelsForPackage = function (
        packageObject: PackageObjectType,
        parentPackageName: string,
        registry: string
    ) {
        let labels = {};
        if (packageObject.config && packageObject.config.labels) {
            labels = packageObject.config.labels;
        }

        labels[constants.ARGOPM_INSTALLER_LABEL] = encode(constants.ARGOPM_INSTALLER_LABEL_VALUE);
        labels[constants.ARGOPM_LIBRARY_NAME_LABEL] = specialEncode(packageObject.name);
        labels[constants.ARGOPM_LIBRARY_VERSION_LABEL] = encode(packageObject.version);
        labels[constants.ARGOPM_LIBRARY_PARENT_LABEL] = specialEncode(parentPackageName);
        labels[constants.ARGOPM_LIBRARY_REGISTRY_LABEL] = specialEncode(registry);
        return labels;
    };

    /**
     * Create the K8s annoation object
     * @param {Object} packageObject
     * @param {string} parentPackageName
     * @param {string} registry
     */
    static createK8sAnnotationsForPackage = function (
        packageObject: PackageObjectType,
        parentPackageName: string,
        registry: string
    ) {
        let annotations = {};
        if (packageObject.config && packageObject.config.annotations) {
            annotations = packageObject.config.annotations;
        }

        annotations[constants.ARGOPM_LIBRARY_PARENT_LABEL] = parentPackageName;
        annotations[constants.ARGOPM_LIBRARY_REGISTRY_LABEL] = registry;
        annotations[constants.ARGOPM_LIBRARY_NAME_LABEL] = packageObject.name;
        annotations[constants.ARGOPM_LIBRARY_DESCRIPTION_LABEL] = packageObject.description;
        annotations[constants.ARGOPM_LIBRARY_HOMEPAGE_LABEL] = packageObject.homepage || "";
        if (packageObject.bugs) {
            annotations[constants.ARGOPM_LIBRARY_SUPPORT_LABEL] = packageObject.bugs.email || "";
        } else {
            annotations[constants.ARGOPM_LIBRARY_SUPPORT_LABEL] = JSON.stringify(packageObject.bugs) || "";
        }
        if (packageObject.author.name) {
            annotations[constants.ARGOPM_LIBRARY_AUTHOR_LABEL] = packageObject.author.name;
        } else {
            annotations[constants.ARGOPM_LIBRARY_AUTHOR_LABEL] = JSON.stringify(packageObject.author);
        }
        if (packageObject.repository) {
            annotations[constants.ARGOPM_LIBRARY_REPO_LABEL] = packageObject.repository.url;
        }

        if (packageObject.keywords) {
            annotations[constants.ARGOPM_LIBRARY_KEYWORD_LABEL] = JSON.stringify(packageObject.keywords);
        }

        return annotations;
    };

    /**
     * Get Package label
     * @param {string} packageName
     * @returns {string}
     */
    static getPackageLabel = function (packageName: string): string {
        return `${constants.ARGOPM_LIBRARY_NAME_LABEL}=${specialEncode(packageName)}`;
    };
}
