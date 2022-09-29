import { constants } from "../constants";
import { compare } from "compare-versions";

export class Resource {
    resource: any;
    version: any;
    resourceVersion: any;
    metadata: any;

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
        return this.resource.kind === constants.ARGO_DATAFLOW_KIND;
    }

    /**
     *
     * @param {Object} resource
     * @returns {string}
     */
    static getVersion(resource) {
        if (!resource || !resource.metadata || !resource.metadata.labels) return "0.0.0";
        return resource.metadata.labels[constants.ARGOPM_LIBRARY_VERSION_LABEL];
    }
}