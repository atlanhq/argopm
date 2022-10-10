import { CoreV1Api, CustomObjectsApi, KubeConfig, loadYaml, V1ConfigMap, V1ObjectMeta, V1Secret } from "@kubernetes/client-node";
import { existsSync, readdirSync, readFileSync } from "node:fs";
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

export const appendDryRunTag = (dryRun, message) => {
    if (dryRun) {
        message += " (dry-run)";
    }
    console.debug(message);
};

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
    forceUpdate: boolean,
    dryRun?: string,
): { shouldUpdate: boolean; msgPrefix: string } {
    const needsUpdate = resource.needsUpdate(newVersion);

    const msgPrefix = `${name} ${kind} already present in the cluster.`;
    const shouldUpdate = needsUpdate || forceUpdate;

    if (!shouldUpdate) {
        if (resource.isNewer(newVersion)) {
            appendDryRunTag(dryRun, `${msgPrefix} v${resource.version} installed is newer than v${newVersion}. Skipping update.`);
        } else {
            appendDryRunTag(dryRun, `${msgPrefix} v${resource.version} is already latest version. Skipping update.`);
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
    dryRun: boolean;
    installParts: any;
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
     * @param {boolean} dryRun Run K8s API functions as dry-run
     * @param {K8sInstallerOptionsType} options
     */
    constructor(
        packagePath: string,
        namespace: string,
        parentPackage: string,
        registry: string,
        dryRun: boolean,
        installParts: any,
        options: K8sInstallerOptionsType
    ) {
        this.packagePath = packagePath;
        this.namespace = namespace;
        this.forceUpdate = options.force;
        this.parentPackage = parentPackage;
        this.registry = registry;
        this.dryRun = dryRun;
        this.installParts = installParts;
        this.package = JSON.parse(readFileSync(`${this.packagePath}/package.json`, "utf-8"));
        this.cronString = options.cronString;
        this.timeZone = options.timeZone;
    }

    /**
     * Installs the given package to Argo K8s deployment
     * @param {boolean} cluster
     */
    async install(cluster: boolean) {
        appendDryRunTag(this.dryRun, `Installing package ${this.package.name}@${this.package.version}`);

        /**
         * This condition is needed because:
         * - when the entire installParts object is empty, it means install all
         * - otherwise, install only the K8s resources specified in each specific kind,
         *   so "undefined" and empty list are not similar truthy conditions at this point
         */
        let toInstall = [];
        if (Object.keys(this.installParts).filter(k => this.installParts[k] !== undefined).length > 0) {
            if (this.installParts[constants.CONFIGMAP_KIND]) {
                toInstall.push(this.installConfigmaps(this.installParts[constants.CONFIGMAP_KIND]));
            }
            if (this.installParts[constants.SECRET_KIND]) {
                toInstall.push(this.installSecrets(this.installParts[constants.SECRET_KIND]));
            }
            if (this.installParts[constants.ARGO_DATAFLOW_KIND]) {
                toInstall.push(this.installPipelines(this.installParts[constants.ARGO_DATAFLOW_KIND]));
            }
            if (this.installParts[constants.ARGO_WORKFLOW_TEMPLATES_KIND]) {
                toInstall.push(this.installTemplates(cluster, this.installParts[constants.ARGO_WORKFLOW_TEMPLATES_KIND]));
            }
            if (this.installParts[constants.ARGO_CRON_WORKFLOW_KIND]) {
                toInstall.push(this.installCronWorkflows(cluster, this.installParts[constants.ARGO_CRON_WORKFLOW_KIND]));
            }
        } else {
            toInstall = [
                this.installConfigmaps(),
                this.installSecrets(),
                this.installPipelines(),
                this.installTemplates(cluster),
                this.installCronWorkflows(cluster),
            ];
        }

        return await Promise.all(toInstall).then(results => results.reduce((prev, curr) => prev + curr));
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
    async installYamlInPath<T extends GenericK8sSpecType>(
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
            forceUpdate: boolean,
            dryRun?: string,
        ) => void
    ) {
        let installed: number;
        if (existsSync(dirPath)) {
            const files = (readdirSync(dirPath)).filter(
                (file: string) => file.endsWith(".yaml") || file.endsWith(".yml")
            );
            const toInstall = [];
            for (const file of files) {
                const filePath = `${dirPath}${file}`;
                const data = readFileSync(filePath, "utf8");
                const yamlData = loadYaml<T>(data);

                if (yamlData && (names === undefined || names?.includes(yamlData.metadata?.name))) {
                    const fileName = file.substring(0, file.lastIndexOf("."));
                    const folder = dirPath
                        .split("/")
                        .filter((el: string) => el.trim().length > 0)
                        .pop();

                    const apmYAML = this.addAPMLabels(yamlData, folder, fileName);
                    toInstall.push(fn(this.package.name, this.namespace, kind, group, apmYAML, cluster, this.forceUpdate, this.dryRun ? "All" : undefined));
                }
            }
            installed = await Promise.all(toInstall).then(results => results.length);
        }
        return installed;
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
        forceUpdate: boolean,
        dryRun?: string,
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
            const { shouldUpdate, msgPrefix } = checkExistingResource(resource, name, kind, newVersion, forceUpdate, dryRun);
            if (shouldUpdate) {
                appendDryRunTag(dryRun, `${msgPrefix} v${resource.version} will be patch updated to v${newVersion}`)
                return await coreK8sApi.patchNamespacedConfigMap(
                    name,
                    namespace,
                    yamlObject,
                    undefined,
                    dryRun,
                    undefined,
                    undefined,
                    undefined,
                    {
                        headers: { "content-type": "application/strategic-merge-patch+json" },
                    }
                );
            }
        } else {
            appendDryRunTag(dryRun, `${name} ${kind} not present in the cluster. Installing v${newVersion}`);
            return await coreK8sApi.createNamespacedConfigMap(namespace, yamlObject, undefined, dryRun);
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
        forceUpdate: boolean,
        dryRun?: string,
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
            const { shouldUpdate, msgPrefix } = checkExistingResource(resource, name, kind, newVersion, forceUpdate, dryRun);
            if (shouldUpdate) {
                appendDryRunTag(dryRun, `${msgPrefix} v${resource.version} will be patch updated to v${newVersion}`);
                return await coreK8sApi.patchNamespacedSecret(
                    name,
                    namespace,
                    yamlObject,
                    undefined,
                    dryRun,
                    undefined,
                    undefined,
                    undefined,
                    {
                        headers: { "content-type": "application/strategic-merge-patch+json" },
                    }
                );
            }
        } else {
            appendDryRunTag(dryRun, `${name} ${kind} not present in the cluster. Installing v${newVersion}`);
            return await coreK8sApi.createNamespacedSecret(namespace, yamlObject, undefined, dryRun);
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
     * @param {string} dryRun
     */
    static async upsertTemplate(
        packageName: string,
        namespace: string,
        kind: string,
        group: string,
        yamlObject: GenericK8sSpecType,
        cluster: boolean,
        forceUpdate: boolean,
        dryRun?: string,
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
                if (yamlObject["spec"]["workflowSpec"]["workflowTemplateRef"]) {
                    yamlObject["spec"]["workflowSpec"]["workflowTemplateRef"]["clusterScope"] = true;
                    // cron workflows have no concept of clusterInstall
                    cluster = false;
                }
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
            forceUpdate,
            dryRun
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
    static handleUpsertWithTemplateResponse(
        response: K8sApiResponse,
        namespace: string,
        plural: string,
        yamlObject: GenericK8sSpecType,
        cluster: boolean,
        apiGroup: string,
        forceUpdate: boolean,
        dryRun?: string,
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
                forceUpdate,
                dryRun
            );

            if (shouldUpdate) {
                if (resource.updateStrategyIsRecreate()) {
                    appendDryRunTag(dryRun, `${msgPrefix} v${resource.version} will be deleted and replaced with v${newVersion}`);
                    return K8sInstaller.recreateCustomResource(
                        name,
                        namespace,
                        plural,
                        yamlObject,
                        cluster,
                        apiGroup,
                        dryRun
                    );
                } else {
                    appendDryRunTag(dryRun, `${msgPrefix} v${resource.version} will be patch updated to v${newVersion}`);
                    return K8sInstaller.patchCustomResource(name, namespace, plural, yamlObject, cluster, apiGroup, dryRun);
                }
            }
        } else {
            appendDryRunTag(dryRun, `${name} ${yamlObject.kind} not present in the cluster. Installing v${newVersion}`);
            return K8sInstaller.createCustomResource(namespace, plural, yamlObject, cluster, apiGroup, dryRun);
        }
    }

    /**
     *
     * @param {string} namespace
     * @param {string} plural
     * @param {Object} yamlObject
     * @param {boolean} cluster
     * @param {string} apiGroup
     * @param {string} dryRun
     * @returns
     */
    static async createCustomResource(
        namespace: string,
        plural: string,
        yamlObject: GenericK8sSpecType,
        cluster: boolean,
        apiGroup: string,
        dryRun?: string,
    ) {
        if (cluster) {
            return await customK8sApi.createClusterCustomObject(
                apiGroup,
                constants.ARGO_K8S_API_VERSION,
                plural,
                yamlObject,
                undefined,
                dryRun,
            );
        } else {
            return await customK8sApi.createNamespacedCustomObject(
                apiGroup,
                constants.ARGO_K8S_API_VERSION,
                namespace,
                plural,
                yamlObject,
                undefined,
                dryRun,
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
     * @param {string} dryRun
     * @returns
     */
    static async patchCustomResource(
        name: string,
        namespace: string,
        plural: string,
        yamlObject: GenericK8sSpecType,
        cluster: boolean,
        apiGroup: string,
        dryRun?: string,
    ) {
        if (cluster) {
            return await customK8sApi.patchClusterCustomObject(
                apiGroup,
                constants.ARGO_K8S_API_VERSION,
                plural,
                name,
                yamlObject,
                dryRun,
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
                dryRun,
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
     * @param {string} dryRun
     * @returns {Promise<Object>} k8s response
     */
    static async recreateCustomResource(
        name: string,
        namespace: string,
        plural: string,
        yamlObject: object,
        cluster: boolean,
        apiGroup: string,
        dryRun?: string,
    ): Promise<object> {
        if (cluster) {
            await customK8sApi.deleteClusterCustomObject(
                constants.ARGO_K8S_API_GROUP,
                constants.ARGO_K8S_API_VERSION,
                plural,
                name,
                undefined,
                undefined,
                undefined,
                dryRun
            );
            return await customK8sApi.createClusterCustomObject(
                apiGroup,
                constants.ARGO_K8S_API_VERSION,
                plural,
                yamlObject,
                undefined,
                dryRun,
            );
        } else {
            await customK8sApi.deleteNamespacedCustomObject(
                apiGroup,
                constants.ARGO_K8S_API_VERSION,
                namespace,
                plural,
                name,
                undefined,
                undefined,
                undefined,
                dryRun
            );
            return await customK8sApi.createNamespacedCustomObject(
                apiGroup,
                constants.ARGO_K8S_API_VERSION,
                namespace,
                plural,
                yamlObject,
                undefined,
                dryRun
            );
        }
    }
}
