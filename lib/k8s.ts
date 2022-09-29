// ./lib/js
import { constants } from "./constants";
import { readdir, readFile } from "node:fs/promises";
import { readFileSync, existsSync } from "node:fs";
import { load } from "js-yaml";
import { PackageInfo } from "./models/info";
import { Resource } from "./models/resource";
import { CoreV1Api, CustomObjectsApi, KubeConfig } from "@kubernetes/client-node";

const kc = new KubeConfig();
kc.loadFromDefault();

const customK8sApi = kc.makeApiClient(CustomObjectsApi);
const coreK8sApi = kc.makeApiClient(CoreV1Api);

export type GenericK8sSpecType = {
    apiVersion?: string;
    kind?: string;
    metadata?: any;
    spec?: any;
};

/**
 *
 * @param {string} name
 * @returns
 */
function getResourceByName(resources: GenericK8sSpecType[], name: any) {
    //TODO: Possible bottleneck if packages grow.
    return new Resource(resources.find(({ metadata }) => metadata.name === name));
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
function checkExistingResource(resource: Resource, name: any, kind: any, newVersion: any, forceUpdate: any) {
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

export class K8sInstaller {
    packagePath: any;
    namespace: any;
    forceUpdate: any;
    parentPackage: any;
    registry: any;
    package: any;
    cronString: any;
    timeZone: any;

    /**
     * Installs the given package to Argo K8s deployment
     *
     * @param {String} packagePath Argo package path
     * @param {String} namespace Namespace to install the package in
     * @param {String} parentPackage Parent package of the format <packagename>@<version>
     * @param {String} registry Package registry
     * @param {Object} options
     */
    constructor(
        packagePath: unknown,
        namespace: any,
        parentPackage: any,
        registry: string,
        options: { force: any; cronString: any; timeZone: any }
    ) {
        this.packagePath = packagePath;
        this.namespace = namespace;
        this.forceUpdate = options.force;
        this.parentPackage = parentPackage;
        this.registry = registry;
        this.package = JSON.parse(readFileSync(`${this.packagePath}/package.json`, "utf-8"));
        this.cronString = options.cronString;
        this.timeZone = options.timeZone;
    }

    /**
     * Installs the given package to Argo K8s deployment
     * @param {boolean} cluster
     */
    async install(cluster: any) {
        console.log(`Installing package ${this.package.name}@${this.package.version}`);
        await this.installConfigs();
        await this.installSecrets();
        await this.installPipelines();
        await this.installTemplates(cluster);
        await this.installCronWorkflows(cluster);
    }

    /**
     * Installs the config maps
     */
    installConfigs() {
        const dirPath = `${this.packagePath}/configmaps/`;
        return this.installYamlInPath(dirPath, false, constants.CONFIGMAP_KIND, "", K8sInstaller.upsertConfigMap);
    }

    /**
     * Installs secrets
     */
    installSecrets() {
        const dirPath = `${this.packagePath}/secrets/`;
        return this.installYamlInPath(dirPath, false, constants.SECERT_KIND, "", K8sInstaller.upsertSecret);
    }

    /**
     * Installs cron workflows
     * @param {boolean} cluster - determines whether the templateRef is from the cluster scope or a namespace
     */
    installCronWorkflows(cluster: any) {
        const dirPath = `${this.packagePath}/cronworkflows/`;
        return this.installYamlInPath(
            dirPath,
            cluster,
            constants.ARGO_CRON_WORKFLOW_KIND,
            constants.ARGO_K8S_API_GROUP,
            K8sInstaller.upsertTemplate
        );
    }

    /**
     * Installs data pipelines
     */
    installPipelines() {
        const dirPath = `${this.packagePath}/pipelines/`;
        return this.installYamlInPath(
            dirPath,
            false,
            constants.ARGO_DATAFLOW_KIND,
            constants.ARGO_DATAFLOW_K8S_API_GROUP,
            K8sInstaller.upsertTemplate
        );
    }

    /**
     * Installs the templates
     * @param {boolean} cluster Determines if ClusterWorkflowTemplates or WorkflowTemplates are installed
     */
    installTemplates(cluster: any) {
        const dirPath = `${this.packagePath}/templates/`;
        let kind = constants.ARGO_WORKFLOW_TEMPLATES_KIND;
        if (cluster) {
            kind = constants.ARGO_CLUSTER_WORKFLOW_TEMPLATES_KIND;
        }
        return this.installYamlInPath(
            dirPath,
            cluster,
            kind,
            constants.ARGO_K8S_API_GROUP,
            K8sInstaller.upsertTemplate
        );
    }

    /**
     * Install all YAML files in path
     * @param {String} dirPath
     * @param {boolean} cluster
     * @param {string} kind
     * @param {string} group
     * @param {Function} fn
     */
    async installYamlInPath(dirPath: string, cluster: boolean, kind: string, group: string, fn) {
        if (!existsSync(dirPath)) {
            return Promise.resolve(false);
        }

        const files = (await readdir(dirPath)).filter(
            (file: string) => file.endsWith(".yaml") || file.endsWith(".yml")
        );
        files.forEach(async function (file) {
            const filePath = `${dirPath}${file}`;
            const data = await readFile(filePath, "utf8");
            const yamlData = load(data) as GenericK8sSpecType;
            if (!yamlData) {
                return;
            }

            const fileName = file.substring(0, file.lastIndexOf("."));
            const folder = dirPath
                .split("/")
                .filter((el: string) => el.trim().length > 0)
                .pop();

            const apmYAML = this.addAPMLabels(yamlData, folder, fileName);
            return fn(this.package.name, this.namespace, kind, group, apmYAML, cluster, this.forceUpdate);
        });
    }

    /**
     * Installs the given package to Argo K8s deployment
     * @param {Object} yamlObject YAML object
     */
    addAPMLabels(yamlObject: GenericK8sSpecType, folder: any, fileName: any) {
        const metadata = yamlObject.metadata;
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
        return yamlObject;
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
    static async upsertConfigMap(
        packageName: any,
        namespace: string,
        kind: any,
        group: any,
        yamlObject: GenericK8sSpecType,
        cluster: any,
        forceUpdate: any
    ) {
        const response = await coreK8sApi.listNamespacedConfigMap(
            namespace,
            undefined,
            undefined,
            undefined,
            undefined,
            PackageInfo.getPackageLabel(packageName)
        );
        const name = yamlObject.metadata.name;
        const items = response.body.items;
        const resource = getResourceByName(items, name);
        const newVersion = yamlObject.metadata.labels[constants.ARGOPM_LIBRARY_VERSION_LABEL];
        const isPresent = Boolean(resource);

        if (isPresent) {
            const { shouldUpdate, msgPrefix } = checkExistingResource(resource, name, kind, newVersion, forceUpdate);

            if (!shouldUpdate) {
                return;
            }

            console.debug(`${msgPrefix} v${resource.version} will be patch updated to v${newVersion}`);
            return await coreK8sApi.patchNamespacedConfigMap(
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
        return await coreK8sApi.createNamespacedConfigMap(namespace, yamlObject);
    }

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
    static async upsertSecret(
        packageName: any,
        namespace: string,
        kind: any,
        group: any,
        yamlObject: GenericK8sSpecType,
        cluster: any,
        forceUpdate: any
    ) {
        const response = await coreK8sApi.listNamespacedSecret(
            namespace,
            undefined,
            undefined,
            undefined,
            undefined,
            PackageInfo.getPackageLabel(packageName)
        );
        const name = yamlObject.metadata.name;
        const items = response.body.items;
        const resource = getResourceByName(items, name);
        const newVersion = yamlObject.metadata.labels[constants.ARGOPM_LIBRARY_VERSION_LABEL];
        const isPresent = Boolean(resource);

        if (isPresent) {
            const { shouldUpdate, msgPrefix } = checkExistingResource(resource, name, kind, newVersion, forceUpdate);

            if (!shouldUpdate) {
                return;
            }

            console.debug(`${msgPrefix} v${resource.version} will be patch updated to v${newVersion}`);
            return await coreK8sApi.patchNamespacedSecret(
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
        return await coreK8sApi.createNamespacedSecret(namespace, yamlObject);
    }

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
    static async upsertTemplate(
        packageName: any,
        namespace: string,
        kind: string,
        group: string,
        yamlObject: GenericK8sSpecType,
        cluster: any,
        forceUpdate: any
    ) {
        const plural = `${kind.toLowerCase()}s`;
        let response;

        if (!cluster) {
            response = await customK8sApi.listNamespacedCustomObject(
                group,
                constants.ARGO_K8S_API_VERSION,
                namespace,
                plural,
                undefined,
                undefined,
                undefined,
                undefined,
                PackageInfo.getPackageLabel(packageName)
            );
        } else {
            response = await customK8sApi.listClusterCustomObject(
                group,
                constants.ARGO_K8S_API_VERSION,
                plural,
                undefined,
                undefined,
                undefined,
                undefined,
                PackageInfo.getPackageLabel(packageName)
            );
            yamlObject.kind = kind;
            cluster = true;

            // Override the workflowTemplateRef clusterScope variable
            if (kind == constants.ARGO_CRON_WORKFLOW_KIND) {
                yamlObject["spec"]["workflowSpec"]["workflowTemplateRef"]["clusterScope"] = true;
                // cron workflows have no concept of clusterInstall
                cluster = false;
            } else {
                const templates = yamlObject["spec"]["templates"];
                if (templates) {
                    templates.forEach((template: { [x: string]: { [x: string]: any } }) => {
                        if (template["dag"]) {
                            const tasks = template["dag"]["tasks"];
                            tasks.forEach((task: { [x: string]: { [x: string]: boolean } }) => {
                                if (task["templateRef"]) {
                                    task["templateRef"]["clusterScope"] = true;
                                }
                            });
                        }
                    });
                }
            }
        }
        return await K8sInstaller.handleUpsertWithTemplateResponse(
            response,
            namespace,
            plural,
            yamlObject,
            cluster,
            group,
            forceUpdate
        );
    }

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
    static async handleUpsertWithTemplateResponse(
        response: { body: { items: any } },
        namespace: string,
        plural: string,
        yamlObject: GenericK8sSpecType,
        cluster: any,
        apiGroup: string,
        forceUpdate: any
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

            if (!shouldUpdate) {
                return;
            }

            if (resource.updateStrategyIsRecreate()) {
                console.debug(`${msgPrefix} v${resource.version} will be deleted and replaced with v${newVersion}`);
                return await K8sInstaller.recreateCustomResource(
                    name,
                    namespace,
                    plural,
                    yamlObject,
                    cluster,
                    apiGroup
                );
            }
            console.debug(`${msgPrefix} v${resource.version} will be patch updated to v${newVersion}`);
            return await K8sInstaller.patchCustomResource(name, namespace, plural, yamlObject, cluster, apiGroup);
        }

        console.debug(`${name} ${yamlObject.kind} not present in the cluster. Installing v${newVersion}`);
        return await K8sInstaller.createCustomResource(namespace, plural, yamlObject, cluster, apiGroup);
    }

    /**
     *
     * @param {string} namespace
     * @param {string} plural
     * @param {Object} yamlObject
     * @param {boolean} cluster
     * @param {string} apiGroup
     * @returns
     */
    static async createCustomResource(
        namespace: string,
        plural: string,
        yamlObject: GenericK8sSpecType,
        cluster: any,
        apiGroup: string
    ) {
        if (cluster) {
            return await customK8sApi.createClusterCustomObject(
                apiGroup,
                constants.ARGO_K8S_API_VERSION,
                plural,
                yamlObject
            );
        } else {
            return await customK8sApi.createNamespacedCustomObject(
                apiGroup,
                constants.ARGO_K8S_API_VERSION,
                namespace,
                plural,
                yamlObject
            );
        }
    }

    /**
     *
     * @param {string} name
     * @param {string} namespace
     * @param {string} plural
     * @param {Object} yamlObject
     * @param {boolean} cluster
     * @param {string} apiGroup
     * @returns
     */
    static async patchCustomResource(
        name: string,
        namespace: string,
        plural: string,
        yamlObject: GenericK8sSpecType,
        cluster: any,
        apiGroup: string
    ) {
        if (cluster) {
            return await customK8sApi.patchClusterCustomObject(
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
        } else {
            return await customK8sApi.patchNamespacedCustomObject(
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
        }
    }

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
    static async recreateCustomResource(name, namespace, plural, yamlObject, cluster, apiGroup) {
        if (cluster) {
            await customK8sApi.deleteClusterCustomObject(
                constants.ARGO_K8S_API_GROUP,
                constants.ARGO_K8S_API_VERSION,
                plural,
                name
            );
            return await customK8sApi.createClusterCustomObject(
                apiGroup,
                constants.ARGO_K8S_API_VERSION,
                plural,
                yamlObject
            );
        } else {
            await customK8sApi.deleteNamespacedCustomObject(
                apiGroup,
                constants.ARGO_K8S_API_VERSION,
                namespace,
                plural,
                name
            );
            return await customK8sApi.createNamespacedCustomObject(
                apiGroup,
                constants.ARGO_K8S_API_VERSION,
                namespace,
                plural,
                yamlObject
            );
        }
    }
}