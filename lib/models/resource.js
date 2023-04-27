const constants = require("../constants").constants;
const { compare } = require("compare-versions");

class Resource {
    /**
     *
     * @param {Object} resource k8s resource object
     */
    constructor(resource) {
        this.resource = resource;
        this.version = Resource.getVersion(resource);
        this.resourceVersion = resource.metadata.resourceVersion;
        this.metadata = resource.metadata;
    }

    needsUpdate(packageVersion) {
        return compare(this.version, packageVersion, "<");
    }

    isNewer(packageVersion) {
        return compare(this.version, packageVersion, ">");
    }

    updateStrategyIsRecreate() {
        return (
            this.resource.kind === constants.ARGO_PIPELINE_KIND &&
            this.resource.apiVersion.startsWith(constants.ARGO_DATAFLOW_K8S_API_GROUP)
        );
    }
}
/**
 *
 * @param {Object} resource
 * @returns {string}
 */
Resource.getVersion = function (resource) {
    if (!resource || !resource.metadata || !resource.metadata.labels) return "0.0.0";
    return resource.metadata.labels[constants.ARGOPM_LIBRARY_VERSION_LABEL];
};

module.exports = Resource;
