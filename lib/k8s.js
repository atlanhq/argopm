// ./lib/k8s.js
const constants = require("./constants").constants;
const Promise = require("bluebird");
const fs = Promise.promisifyAll(require("fs"));
const yaml = require("js-yaml");
const PackageInfo = require("./models/info").PackageInfo;
const Resource = require("./models/resource");
const k8s = require("@kubernetes/client-node");
const kc = new k8s.KubeConfig();
kc.loadFromDefault();

const customK8sApi = kc.makeApiClient(k8s.CustomObjectsApi);
const coreK8sApi = kc.makeApiClient(k8s.CoreV1Api);

/**
 *
 * @param {string} name
 * @returns {Resource}
 */
function getResourceByName(resources, name) {
    //TODO: Possible bottleneck if packages grow.
    for (const resource of resources) {
        if (resource.metadata.name === name) {
            return new Resource(resource);
        }
    }
}

/**
 *
 * @param {Resource} resource
 * @param {string} name
 * @param {string} kind
 * @param {string} newVersion
 * @param {boolean} forceUpdate
 * @returns {{shouldUpdate: boolean, msgPrefix: string}}
 */
function checkExistingResource(resource, name, kind, newVersion, forceUpdate) {
    const needsUpdate = resource.needsUpdate(newVersion);

    const msgPrefix = `${name} ${kind} already present in the cluster.`;
    const shouldUpdate = needsUpdate || forceUpdate;

    if (!shouldUpdate) {
        if (resource.isNewer(newVersion)) {
            console.debug(`${msgPrefix} v${resource.version} installed is newer than v${newVersion}. Skipping update.`);
        } else {
            console.debug(`${msgPrefix} v${resource.version} is already latest version. Skipping update.`);
        }
    }

    return { shouldUpdate, msgPrefix };
}

function enableClusterScope(yamlObject) {
    const templates = yamlObject["spec"]["templates"];
    if (templates) {
        templates.forEach((template) => {
            if (template["dag"]) {
                const tasks = template["dag"]["tasks"];
                tasks.forEach((task) => {
                    if (task["templateRef"]) {
                        task["templateRef"]["clusterScope"] = true;
                    }
                });
            }
            if (template["steps"]) {
                const steps = template["steps"];
                steps.forEach((sub_steps) => {
                    sub_steps.forEach((sub_step) => {
                        if (sub_step["templateRef"]) {
                            sub_step["templateRef"]["clusterScope"] = true;
                        }
                    });
                });
            }
        });
    }
}

function copyPackageInfoToPodMetaData(yamlObject, kind) {
    const LABEL_NAME = constants.ARGOPM_LIBRARY_NAME_LABEL;
    const ANNOTATION_VERSION = constants.ARGOPM_LIBRARY_VERSION_LABEL;

    if (kind === constants.ARGO_WORKFLOW_TEMPLATES_KIND || kind === constants.ARGO_CLUSTER_WORKFLOW_TEMPLATES_KIND) {
        let metadata = yamlObject.metadata;
        let spec = yamlObject.spec;
        spec.podMetadata = spec.podMetadata || {};
        if (metadata.labels && metadata.labels[ANNOTATION_VERSION]) {
            spec.podMetadata.annotations = spec.podMetadata.annotations || {};
            spec.podMetadata.annotations[ANNOTATION_VERSION] = metadata.labels[ANNOTATION_VERSION];
        }
        if (metadata.annotations && metadata.annotations[LABEL_NAME]) {
            spec.podMetadata.annotations = spec.podMetadata.annotations || {};
            spec.podMetadata.annotations[LABEL_NAME] = metadata.annotations[LABEL_NAME];
        }
    }
    return yamlObject;
}

class K8sInstaller {
    /**
     * Installs the given package to Argo K8s deployment
     *
     * @param {String} packagePath Argo package path
     * @param {String} namespace Namespace to install the package in
     * @param {String} parentPackage Parent package of the format <packagename>@<version>
     * @param {String} registry Package registry
     * @param {Object} options
     */
    constructor(packagePath, namespace, parentPackage, registry, options) {
        this.packagePath = packagePath;
        this.namespace = namespace;
        this.forceUpdate = options.force;
        this.parentPackage = parentPackage;
        this.registry = registry;
        this.package = JSON.parse(fs.readFileSync(`${this.packagePath}/package.json`, "utf-8"));
        this.cronString = options.cronString;
        this.timeZone = options.timeZone;
        this.azure = options.azure;
    }

    /**
     * Installs the given package to Argo K8s deployment
     * @param {boolean} cluster
     */
    install(cluster) {
        console.log(`Installing package ${this.package.name}@${this.package.version}`);
        return this.installConfigs()
            .then((_) => {
                return this.installSecrets();
            })
            .then((_) => {
                return this.installDataflowPipelines();
            })
            .then((_) => {
                return this.installNumaflowPipelines();
            })
            .then((_) => {
                return this.installTemplates(cluster);
            })
            .then((_) => {
                return this.installCronWorkflows(cluster);
            });
    }

    /**
     * Installs the config maps
     */
    installConfigs() {
        const dirPath = `${this.packagePath}/configmaps/`;
        return this.installYamlInPath(
            dirPath,
            false,
            constants.CONFIGMAP_KIND,
            "",
            K8sInstaller.upsertConfigMap,
            null,
            null
        );
    }

    /**
     * Installs secrets
     */
    installSecrets() {
        const dirPath = `${this.packagePath}/secrets/`;
        return this.installYamlInPath(dirPath, false, constants.SECERT_KIND, "", K8sInstaller.upsertSecret, null, null);
    }

    /**
     * Installs cron workflows
     * @param {boolean} cluster - determines whether the templateRef is from the cluster scope or a namespace
     */
    installCronWorkflows(cluster) {
        const dirPath = `${this.packagePath}/cronworkflows/`;
        return this.installYamlInPath(
            dirPath,
            cluster,
            constants.ARGO_CRON_WORKFLOW_KIND,
            constants.ARGO_K8S_API_GROUP,
            K8sInstaller.upsertTemplate,
            null,
            null
        );
    }

    /**
     * Installs dataflow pipelines
     */
    installDataflowPipelines() {
        const dirPath = `${this.packagePath}/pipelines/`;
        return this.installYamlInPath(
            dirPath,
            false,
            constants.ARGO_PIPELINE_KIND,
            constants.ARGO_DATAFLOW_K8S_API_GROUP,
            K8sInstaller.upsertTemplate,
            (yamlData) => yamlData.apiVersion && yamlData.apiVersion.startsWith(constants.ARGO_DATAFLOW_K8S_API_GROUP),
            null
        );
    }

    /**
     * Installs numaflow pipelines
     */
    installNumaflowPipelines() {
        const dirPath = `${this.packagePath}/pipelines/`;
        return this.installYamlInPath(
            dirPath,
            false,
            constants.ARGO_PIPELINE_KIND,
            constants.ARGO_NUMAFLOW_K8S_API_GROUP,
            K8sInstaller.upsertTemplate,
            (yamlData) => yamlData.apiVersion && yamlData.apiVersion.startsWith(constants.ARGO_NUMAFLOW_K8S_API_GROUP),
            null
        ).catch((err) => {
            if (err && err.response && err.response.statusCode == 404) {
                console.error("Numaflow CRDS Missing from cluster, skipping install");
            } else {
                throw err;
            }
        });
    }

    /**
     * Installs the templates
     * @param {boolean} cluster Determines if ClusterWorkflowTemplates or WorkflowTemplates are installed
     */
    installTemplates(cluster) {
        const dirPath = `${this.packagePath}/templates/`;
        var kind = constants.ARGO_WORKFLOW_TEMPLATES_KIND;
        if (cluster) {
            kind = constants.ARGO_CLUSTER_WORKFLOW_TEMPLATES_KIND;
        }
        return this.installYamlInPath(
            dirPath,
            cluster,
            kind,
            constants.ARGO_K8S_API_GROUP,
            K8sInstaller.upsertTemplate,
            null,
            this.azure ? this.convertS3ArtifactsToAzureBlob : null
        );
    }

    /**
     * Install all YAML files in path
     * @param {String} dirPath
     * @param {boolean} cluster
     * @param {string} kind
     * @param {string} group
     * @param {Function} fn
     * @param {Function} preProcessFn
     */
    installYamlInPath(dirPath, cluster, kind, group, fn, filter, preProcessFn) {
        if (!fs.existsSync(dirPath)) {
            return Promise.resolve(false);
        }

        const mainThis = this;
        return fs.readdirAsync(dirPath).then((files) => {
            files = files.filter((file) => file.endsWith(".yaml") || file.endsWith(".yml"));
            return Promise.each(files, function (file) {
                const filePath = `${dirPath}${file}`;
                return fs
                    .readFileAsync(filePath, "utf8")
                    .then((data) => {
                        return yaml.load(data);
                    })
                    .then((yamlData) => {
                        if (!yamlData) return;
                        if (filter && !filter(yamlData)) return;
                        const fileName = file.substring(0, file.lastIndexOf("."));
                        const folder = dirPath
                            .split("/")
                            .filter(function (el) {
                                return el.trim().length > 0;
                            })
                            .pop();
                        if (preProcessFn) {
                            yamlData = preProcessFn(yamlData);
                        }
                        const apmYAML = mainThis.addAPMLabels(yamlData, folder, fileName, kind);
                        return fn(
                            mainThis.package.name,
                            mainThis.namespace,
                            kind,
                            group,
                            apmYAML,
                            cluster,
                            mainThis.forceUpdate
                        );
                    });
            });
        });
    }

    /**
     * @param {Object} yamlObject YAML object
     */
    convertS3ArtifactsToAzureBlob(yamlObject) {
        const searchKey = "s3";

        // Recursive function to search for the key
        function searchForKey(obj) {
            if (typeof obj !== "object" || obj === null) {
                return;
            }
            // Check if the key exists in the current object
            if (searchKey in obj) {
                const value = obj[searchKey];
                obj["azure"] = { blob: value["key"] };
                delete obj[searchKey];
            }
            // Recursively search for the key in nested objects or arrays
            for (const prop in obj) {
                if (typeof obj[prop] !== "object" || obj[prop] === null) continue;
                searchForKey(obj[prop]);
            }
        }

        // Start the search
        searchForKey(yamlObject);

        return yamlObject;
    }

    /**
     * Installs the given package to Argo K8s deployment
     * @param {Object} yamlObject YAML object
     */
    addAPMLabels(yamlObject, folder, fileName, kind) {
        let metadata = yamlObject.metadata;
        if (!metadata.name) {
            metadata.name = this.package.name.replace(/@/g, "-").replace(/\//g, "-").replace(/:/g, "-");
            if (folder && fileName) {
                metadata.name = `${metadata.name}-${folder}-${fileName}`;
            }
        }

        if (metadata.labels === undefined) {
            metadata.labels = {};
        }
        if (metadata.annotations === undefined) {
            metadata.annotations = {};
        }

        const argoPMLabels = PackageInfo.createK8sLabelsForPackage(this.package, this.parentPackage, this.registry);
        Object.keys(argoPMLabels).forEach(function (key) {
            metadata.labels[key] = argoPMLabels[key];
        });

        const argoPMAnnotations = PackageInfo.createK8sAnnotationsForPackage(
            this.package,
            this.parentPackage,
            this.registry
        );
        Object.keys(argoPMAnnotations).forEach(function (key) {
            metadata.annotations[key] = argoPMAnnotations[key];
        });

        yamlObject.metadata = metadata;
        return copyPackageInfoToPodMetaData(yamlObject, kind);
    }
}

/**
 * Insert or update configmaps
 * @param {string} packageName
 * @param {string} namespace
 * @param {string} kind
 * @param {string} group
 * @param {object} yamlObject
 * @param {boolean} cluster
 * @param {boolean} forceUpdate
 * @returns {Promise<Object | null>}
 */
K8sInstaller.upsertConfigMap = function (packageName, namespace, kind, group, yamlObject, cluster, forceUpdate) {
    const name = yamlObject.metadata.name;
    return coreK8sApi
        .listNamespacedConfigMap(namespace, null, null, null, null, PackageInfo.getPackageLabel(packageName))
        .then((response) => {
            const name = yamlObject.metadata.name;
            const items = response.body.items;
            const resource = getResourceByName(items, name);
            const newVersion = yamlObject.metadata.labels[constants.ARGOPM_LIBRARY_VERSION_LABEL];
            const isPresent = Boolean(resource);

            if (isPresent) {
                const { shouldUpdate, msgPrefix } = checkExistingResource(
                    resource,
                    name,
                    kind,
                    newVersion,
                    forceUpdate
                );
                if (!shouldUpdate) return Promise.resolve(null);
                console.debug(`${msgPrefix} v${resource.version} will be patch updated to v${newVersion}`);
                return coreK8sApi.patchNamespacedConfigMap(
                    name,
                    namespace,
                    yamlObject,
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    {
                        headers: { "content-type": "application/strategic-merge-patch+json" },
                    }
                );
            }
            console.debug(`${name} ${kind} not present in the cluster. Installing v${newVersion}`);
            return coreK8sApi.createNamespacedConfigMap(namespace, yamlObject);
        });
};

/**
 * Insert or update secret
 * @param {string} packageName
 * @param {string} namespace
 * @param {string} kind
 * @param {string} group
 * @param {object} yamlObject
 * @param {boolean} cluster
 * @param {boolean} forceUpdate
 * @returns {Promise<Object | null>}
 */
K8sInstaller.upsertSecret = function (packageName, namespace, kind, group, yamlObject, cluster, forceUpdate) {
    return coreK8sApi
        .listNamespacedSecret(namespace, null, null, null, null, PackageInfo.getPackageLabel(packageName))
        .then((response) => {
            const name = yamlObject.metadata.name;
            const items = response.body.items;
            const resource = getResourceByName(items, name);
            const newVersion = yamlObject.metadata.labels[constants.ARGOPM_LIBRARY_VERSION_LABEL];
            const isPresent = Boolean(resource);

            if (isPresent) {
                const { shouldUpdate, msgPrefix } = checkExistingResource(
                    resource,
                    name,
                    kind,
                    newVersion,
                    forceUpdate
                );
                if (!shouldUpdate) return Promise.resolve(null);
                console.debug(`${msgPrefix} v${resource.version} will be patch updated to v${newVersion}`);
                return coreK8sApi.patchNamespacedSecret(
                    name,
                    namespace,
                    yamlObject,
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    {
                        headers: { "content-type": "application/strategic-merge-patch+json" },
                    }
                );
            }
            console.debug(`${name} ${kind} not present in the cluster. Installing v${newVersion}`);
            return coreK8sApi.createNamespacedSecret(namespace, yamlObject);
        });
};

/**
 * Insert or update the template
 * @param {string} packageName
 * @param {string} namespace
 * @param {string} kind
 * @param {string} group
 * @param {object} yamlObject
 * @param {boolean} cluster
 * @param {boolean} forceUpdate
 */
K8sInstaller.upsertTemplate = function (packageName, namespace, kind, group, yamlObject, cluster, forceUpdate) {
    let plural = `${kind.toLowerCase()}s`;

    if (!cluster) {
        return customK8sApi
            .listNamespacedCustomObject(
                group,
                constants.ARGO_K8S_API_VERSION,
                namespace,
                plural,
                null,
                null,
                null,
                null,
                PackageInfo.getPackageLabel(packageName)
            )
            .then((response) => {
                return K8sInstaller.handleUpsertWithTemplateResponse(
                    response,
                    namespace,
                    plural,
                    yamlObject,
                    cluster,
                    group,
                    forceUpdate
                );
            });
    }
    return customK8sApi
        .listClusterCustomObject(
            group,
            constants.ARGO_K8S_API_VERSION,
            plural,
            null,
            null,
            null,
            null,
            PackageInfo.getPackageLabel(packageName)
        )
        .then((response) => {
            yamlObject["kind"] = kind;
            let clusterInstall = true;

            // Override the workflowTemplateRef clusterScope variable
            if (kind == constants.ARGO_CRON_WORKFLOW_KIND) {
                yamlObject["spec"]["workflowSpec"]["workflowTemplateRef"]["clusterScope"] = true;
                // cron workflows have no concept of clusterInstall
                clusterInstall = false;
            } else {
                enableClusterScope(yamlObject);
            }
            return K8sInstaller.handleUpsertWithTemplateResponse(
                response,
                namespace,
                plural,
                yamlObject,
                clusterInstall,
                group,
                forceUpdate
            );
        });
};

/**
 *
 * @param {Object} response
 * @param {string} namespace
 * @param {string} plural
 * @param {Object} yamlObject
 * @param {string} cluster
 * @param {string} apiGroup
 * @param {boolean} forceUpdate
 * @returns {Promise<Object | null>}
 */
K8sInstaller.handleUpsertWithTemplateResponse = function (
    response,
    namespace,
    plural,
    yamlObject,
    cluster,
    apiGroup,
    forceUpdate
) {
    const name = yamlObject.metadata.name;
    const items = response.body.items;
    const resource = getResourceByName(items, name);
    const newVersion = yamlObject.metadata.labels[constants.ARGOPM_LIBRARY_VERSION_LABEL];
    const isPresent = Boolean(resource);

    if (isPresent) {
        const { shouldUpdate, msgPrefix } = checkExistingResource(
            resource,
            name,
            yamlObject.kind,
            newVersion,
            forceUpdate
        );
        if (!shouldUpdate) return Promise.resolve(null);
        if (resource.updateStrategyIsRecreate()) {
            console.debug(`${msgPrefix} v${resource.version} will be deleted and replaced with v${newVersion}`);
            return K8sInstaller.recreateCustomResource(name, namespace, plural, yamlObject, cluster, apiGroup);
        }
        console.debug(`${msgPrefix} v${resource.version} will be patch updated to v${newVersion}`);
        return K8sInstaller.patchCustomResource(name, namespace, plural, yamlObject, cluster, apiGroup);
    }

    console.debug(`${name} ${yamlObject.kind} not present in the cluster. Installing v${newVersion}`);
    return K8sInstaller.createCustomResource(namespace, plural, yamlObject, cluster, apiGroup);
};

/**
 *
 * @param {string} namespace
 * @param {string} plural
 * @param {Object} yamlObject
 * @param {boolean} cluster
 * @param {string} apiGroup
 * @returns {Promise<Object>} k8s response
 */
K8sInstaller.createCustomResource = function (namespace, plural, yamlObject, cluster, apiGroup) {
    if (cluster) {
        return customK8sApi.createClusterCustomObject(apiGroup, constants.ARGO_K8S_API_VERSION, plural, yamlObject);
    }
    return customK8sApi.createNamespacedCustomObject(
        apiGroup,
        constants.ARGO_K8S_API_VERSION,
        namespace,
        plural,
        yamlObject
    );
};

/**
 *
 * @param {string} name
 * @param {string} namespace
 * @param {string} plural
 * @param {Object} yamlObject
 * @param {boolean} cluster
 * @param {string} apiGroup
 * @returns {Promise<Object>} k8s response
 */
K8sInstaller.patchCustomResource = function (name, namespace, plural, yamlObject, cluster, apiGroup) {
    if (cluster) {
        return customK8sApi.patchClusterCustomObject(
            apiGroup,
            constants.ARGO_K8S_API_VERSION,
            plural,
            name,
            yamlObject,
            undefined,
            undefined,
            undefined,
            { headers: { "content-type": "application/merge-patch+json" } }
        );
    }
    return customK8sApi.patchNamespacedCustomObject(
        apiGroup,
        constants.ARGO_K8S_API_VERSION,
        namespace,
        plural,
        name,
        yamlObject,
        undefined,
        undefined,
        undefined,
        { headers: { "content-type": "application/merge-patch+json" } }
    );
};

/**
 *
 * @param {string} name
 * @param {string} namespace
 * @param {string} plural
 * @param {Object} yamlObject
 * @param {boolean} cluster
 * @param {string} apiGroup
 * @returns {Promise<Object>} k8s response
 */
K8sInstaller.recreateCustomResource = function (name, namespace, plural, yamlObject, cluster, apiGroup) {
    if (cluster) {
        return customK8sApi
            .deleteClusterCustomObject(constants.ARGO_K8S_API_GROUP, constants.ARGO_K8S_API_VERSION, plural, name)
            .then((_) => {
                return customK8sApi.createClusterCustomObject(
                    apiGroup,
                    constants.ARGO_K8S_API_VERSION,
                    plural,
                    yamlObject
                );
            });
    }
    return customK8sApi
        .deleteNamespacedCustomObject(apiGroup, constants.ARGO_K8S_API_VERSION, namespace, plural, name)
        .then((_) => {
            return customK8sApi.createNamespacedCustomObject(
                apiGroup,
                constants.ARGO_K8S_API_VERSION,
                namespace,
                plural,
                yamlObject
            );
        });
};

exports.K8sInstaller = K8sInstaller;
