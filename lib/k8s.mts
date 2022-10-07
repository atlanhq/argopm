import { CoreV1Api, CustomObjectsApi, KubeConfig, loadYaml, V1ConfigMap, V1ObjectMeta, V1Secret } from "@kubernetes/client-node";
import { existsSync, readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { IncomingMessage } from "node:http";
import { constants } from "./constants.mjs";
import { PackageInfo, PackageObjectType } from "./models/info.mjs";
import { Resource } from "./models/resource.mjs";

const kc = new KubeConfig();
kc.loadFromDefault();

const customK8sApi = kc.makeApiClient(CustomObjectsApi);
const coreK8sApi = kc.makeApiClient(CoreV1Api);

export type GenericK8sSpecType = {
    apiVersion?: string;
    kind?: string;
    metadata?: V1ObjectMeta;
    spec?: any;
};

export type K8sApiResponse = {
    response: IncomingMessage;
    body: any;
};

export type K8sInstallerOptionsType = {
    force?: boolean;
    cronString?: string;
    timeZone?: string;
};

/**
 * Get Resource object by name.
 * @param  {GenericK8sSpecType[]} resources
 * @param  {string} name
 */
export function getResourceByName(resources: GenericK8sSpecType[], name: string) {
    //TODO: Possible bottleneck if packages grow.
    const resource = resources.find(({ metadata }) => metadata.name === name);
    if (resource) {
        return new Resource(resource);
    }
    return null;
}

/**
 * CHeck existing Resource object.
 * @param {Resource} resource
 * @param {string} name
 * @param {string} kind
 * @param {string} newVersion
 * @param {boolean} forceUpdate
 * @returns {{shouldUpdate: boolean, msgPrefix: string}}
 */
function checkExistingResource(
    resource: Resource,
    name: string,
    kind: string,
    newVersion: string,
    forceUpdate: boolean
): { shouldUpdate: boolean; msgPrefix: string } {
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
    packagePath: string;
    namespace: string;
    forceUpdate: boolean;
    parentPackage: string;
    registry: string;
    package: PackageObjectType;
    cronString: string;
    timeZone: string;

    /**
     * Installs the given package to Argo K8s deployment
     *
     * @param {string} packagePath Argo package path
     * @param {string} namespace Namespace to install the package in
     * @param {string} parentPackage Parent package of the format <packagename>@<version>
     * @param {string} registry Package registry
     * @param {K8sInstallerOptionsType} options
     */
    constructor(
        packagePath: string,
        namespace: string,
        parentPackage: string,
        registry: string,
        options: K8sInstallerOptionsType
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
    async install(cluster: boolean, installParts: { [k: string]: string[] }) {
        console.log(`Installing package ${this.package.name}@${this.package.version}`);
        await this.installConfigmaps(installParts[constants.CONFIGMAP_KIND]);
        await this.installSecrets(installParts[constants.SECRET_KIND]);
        await this.installPipelines(installParts[constants.ARGO_DATAFLOW_KIND]);
        await this.installTemplates(cluster, installParts[constants.ARGO_WORKFLOW_TEMPLATES_KIND]);
        await this.installCronWorkflows(cluster, installParts[constants.ARGO_CRON_WORKFLOW_KIND]);
    }

    /**
     * Installs the config maps
     */
    async installConfigmaps(names?: string[]) {
        const dirPath = `${this.packagePath}/configmaps/`;
        return await this.installYamlInPath<V1ConfigMap>(
            dirPath,
            false,
            constants.CONFIGMAP_KIND,
            "",
            names,
            K8sInstaller.upsertConfigMap
        );
    }

    /**
     * Installs secrets
     */
    async installSecrets(names?: string[]) {
        const dirPath = `${this.packagePath}/secrets/`;
        return await this.installYamlInPath<V1Secret>(
            dirPath,
            false,
            constants.SECRET_KIND,
            "",
            names,
            K8sInstaller.upsertSecret
        );
    }

    /**
     * Installs cron workflows
     * @param {boolean} cluster - determines whether the templateRef is from the cluster scope or a namespace
     */
    async installCronWorkflows(cluster: boolean, names?: string[]) {
        const dirPath = `${this.packagePath}/cronworkflows/`;
        return await this.installYamlInPath<GenericK8sSpecType>(
            dirPath,
            cluster,
            constants.ARGO_CRON_WORKFLOW_KIND,
            constants.ARGO_K8S_API_GROUP,
            names,
            K8sInstaller.upsertTemplate
        );
    }

    /**
     * Installs data pipelines
     */
    async installPipelines(names?: string[]) {
        const dirPath = `${this.packagePath}/pipelines/`;
        return await this.installYamlInPath<GenericK8sSpecType>(
            dirPath,
            false,
            constants.ARGO_DATAFLOW_KIND,
            constants.ARGO_DATAFLOW_K8S_API_GROUP,
            names,
            K8sInstaller.upsertTemplate
        );
    }

    /**
     * Installs the templates
     * @param {boolean} cluster Determines if ClusterWorkflowTemplates or WorkflowTemplates are installed
     */
    async installTemplates(cluster: boolean, names?: string[]) {
        const dirPath = `${this.packagePath}/templates/`;
        const kind = cluster ? constants.ARGO_CLUSTER_WORKFLOW_TEMPLATES_KIND : constants.ARGO_WORKFLOW_TEMPLATES_KIND;

        return await this.installYamlInPath<GenericK8sSpecType>(
            dirPath,
            cluster,
            kind,
            constants.ARGO_K8S_API_GROUP,
            names,
            K8sInstaller.upsertTemplate
        );
    }

    /**
     * Install all YAML files in path
     * @param {string} dirPath
     * @param {boolean} cluster
     * @param {string} kind
     * @param {string} group
     * @param {any} fn
     */
    async installYamlInPath<T>(
        dirPath: string,
        cluster: boolean,
        kind: string,
        group: string,
        names: string[],
        fn: (
            packageName: string,
            namespace: string,
            kind: string,
            group: string,
            yamlObject: GenericK8sSpecType,
            cluster: boolean,
            forceUpdate: boolean
        ) => void
    ) {
        if (existsSync(dirPath)) {
            const files = (await readdir(dirPath)).filter(
                (file: string) => file.endsWith(".yaml") || file.endsWith(".yml")
            );
            for (const file of files) {
                const filePath = `${dirPath}${file}`;
                const data = await readFile(filePath, "utf8");
                const yamlData = loadYaml<T>(data);

                if (yamlData) {
                    const fileName = file.substring(0, file.lastIndexOf("."));
                    const folder = dirPath
                        .split("/")
                        .filter((el: string) => el.trim().length > 0)
                        .pop();

                    const apmYAML = this.addAPMLabels(yamlData, folder, fileName);
                    fn(this.package.name, this.namespace, kind, group, apmYAML, cluster, this.forceUpdate);
                }
            }
        }
    }

    /**
     * Installs the given package to Argo K8s deployment
     * @param {Object} yamlObject YAML object
     */
    addAPMLabels(yamlObject: GenericK8sSpecType, folder: string, fileName: string) {
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
     * @returns
     */
    static async upsertConfigMap(
        packageName: string,
        namespace: string,
        kind: string,
        group: string,
        yamlObject: GenericK8sSpecType,
        cluster: boolean,
        forceUpdate: boolean
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
        } else {
            console.debug(`${name} ${kind} not present in the cluster. Installing v${newVersion}`);
            return await coreK8sApi.createNamespacedConfigMap(namespace, yamlObject);
        }
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
     * @returns
     */
    static async upsertSecret(
        packageName: string,
        namespace: string,
        kind: string,
        group: string,
        yamlObject: GenericK8sSpecType,
        cluster: boolean,
        forceUpdate: boolean
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
        } else {
            console.debug(`${name} ${kind} not present in the cluster. Installing v${newVersion}`);
            return await coreK8sApi.createNamespacedSecret(namespace, yamlObject);
        }
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
        packageName: string,
        namespace: string,
        kind: string,
        group: string,
        yamlObject: GenericK8sSpecType,
        cluster: boolean,
        forceUpdate: boolean
    ) {
        const plural = `${kind.toLowerCase()}s`;
        let response: K8sApiResponse;

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

            // Override the workflowTemplateRef clusterScope variable
            if (kind == constants.ARGO_CRON_WORKFLOW_KIND) {
                yamlObject["spec"]["workflowSpec"]["workflowTemplateRef"]["clusterScope"] = true;
                // cron workflows have no concept of clusterInstall
                cluster = false;
            } else {
                const templates = yamlObject["spec"]["templates"];
                if (templates) {
                    templates.forEach((template: any) => {
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
     * @returns
     */
    static async handleUpsertWithTemplateResponse(
        response: K8sApiResponse,
        namespace: string,
        plural: string,
        yamlObject: GenericK8sSpecType,
        cluster: boolean,
        apiGroup: string,
        forceUpdate: boolean
    ) {
        const name = yamlObject.metadata.name;
        const items = response.body.items;
        const resource = getResourceByName(items, name);
        const newVersion = yamlObject.metadata.labels[constants.ARGOPM_LIBRARY_VERSION_LABEL];

        if (resource) {
            const { shouldUpdate, msgPrefix } = checkExistingResource(
                resource,
                name,
                yamlObject.kind,
                newVersion,
                forceUpdate
            );

            if (shouldUpdate) {
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
                } else {
                    console.debug(`${msgPrefix} v${resource.version} will be patch updated to v${newVersion}`);
                    return await K8sInstaller.patchCustomResource(name, namespace, plural, yamlObject, cluster, apiGroup);
                }
            }
        } else {
            console.debug(`${name} ${yamlObject.kind} not present in the cluster. Installing v${newVersion}`);
            return await K8sInstaller.createCustomResource(namespace, plural, yamlObject, cluster, apiGroup);
        }
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
        cluster: boolean,
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
        cluster: boolean,
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
    static async recreateCustomResource(
        name: string,
        namespace: string,
        plural: string,
        yamlObject: object,
        cluster: boolean,
        apiGroup: string
    ): Promise<object> {
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
