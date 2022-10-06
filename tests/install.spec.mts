import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { CoreV1Api, CustomObjectsApi, KubeConfig, loadYaml, V1ConfigMap, V1Secret } from "@kubernetes/client-node";
import { readFile } from "fs/promises";
import npa from "npm-package-arg";
import shell from "shelljs";
import yarg from "../bin/install.mjs";
import { constants } from "../lib/constants.mjs";
import { packageNameFromPath } from "../lib/install.mjs";
import { GenericK8sSpecType, getResourceByName } from "../lib/k8s.mjs";
import { encode, PackageInfo } from "../lib/models/info.mjs";

const kc = new KubeConfig();
kc.loadFromDefault();
const coreK8sApi = kc.makeApiClient(CoreV1Api);
const customK8sApi = kc.makeApiClient(CustomObjectsApi);

const TMP_DIR = "/tmp/test-install-package";
const CURRENT_DIR = shell.pwd();
const MOCK_PACKAGE_DIR = `${CURRENT_DIR.stdout}/tests/fixtures/mock-package`;
const NEW_VERSION_BUMP = "0.0.2";

const getResource = async <T,>(path: string) => {
    const data = await readFile(`${MOCK_PACKAGE_DIR}/${path}`);
    const resource = loadYaml<T>(data.toString());
    return resource;
};

describe("argopm install", () => {
    const namespace = "argo";
    let packageName;
    let packageJson;
    let packageVersion;
    const consoleDebugSpy = jest.spyOn(console, "debug");

    beforeEach(async () => {
        jest.resetModules();
        shell.rm("-Rf", TMP_DIR);
        shell.mkdir(TMP_DIR);
        shell.cp("-R", `${MOCK_PACKAGE_DIR}/*`, `${TMP_DIR}/`);
        shell.cd(TMP_DIR);
        packageName = npa(packageNameFromPath(TMP_DIR));
    });

    afterEach(() => {
        jest.resetAllMocks();
        shell.cd("-");
        // TODO: Need to uninstall after this test
    });

    describe("fresh-install all", () => {
        beforeEach(async () => {
            await yarg.parse("install .");
            packageJson = JSON.parse(await readFile(`${TMP_DIR}/package.json`, "utf-8"));
            packageVersion = encode(packageJson.version);
        });

        it("should create configmaps successfully", async () => {
            const configmap = await getResource<V1ConfigMap>("configmaps/default.yaml");
            const configmapList = await coreK8sApi.listNamespacedConfigMap(
                namespace,
                undefined,
                undefined,
                undefined,
                undefined,
                packageName.name ? PackageInfo.getPackageLabel(packageName.name) : undefined
            );

            expect(configmapList.response.statusCode).toEqual(200);
            expect(configmapList.body.items.length).toEqual(1);
            expect(configmapList.body.items[0].metadata?.name).toEqual(configmap.metadata?.name);
            expect(consoleDebugSpy).toBeCalledWith(
                `${configmap.metadata?.name} ${constants.CONFIGMAP_KIND} not present in the cluster. Installing v${packageVersion}`
            );
        });

        it("should create secrets successfully", async () => {
            const secret = await getResource<V1Secret>("secrets/default.yaml");
            const secretList = await coreK8sApi.listNamespacedSecret(
                namespace,
                undefined,
                undefined,
                undefined,
                undefined,
                packageName.name ? PackageInfo.getPackageLabel(packageName.name) : undefined
            );

            expect(secretList.response.statusCode).toEqual(200);
            expect(secretList.body.items.length).toEqual(1);
            expect(secretList.body.items[0].metadata?.name).toEqual(secret.metadata?.name);
            expect(consoleDebugSpy).toBeCalledWith(
                `${secret.metadata?.name} ${constants.SECRET_KIND} not present in the cluster. Installing v${packageVersion}`
            );
        });

        it("should create workflow templates successfully", async () => {
            const workflowTemplate = await getResource<GenericK8sSpecType>("templates/default.yaml");
            const workflowTemplateList = await customK8sApi.listNamespacedCustomObject(
                constants.ARGO_K8S_API_GROUP,
                constants.ARGO_K8S_API_VERSION,
                namespace,
                `${constants.ARGO_WORKFLOW_TEMPLATES_KIND.toLowerCase()}s`,
                undefined,
                undefined,
                undefined,
                undefined,
                packageName.name ? PackageInfo.getPackageLabel(packageName.name) : undefined
            );

            expect(workflowTemplateList.response.statusCode).toEqual(200);
            expect(workflowTemplateList.body).toHaveProperty("items");
            expect(workflowTemplateList.body["items"]).toBeInstanceOf(Array);
            expect(workflowTemplateList.body["items"].length).toEqual(1);
            expect(workflowTemplateList.body["items"][0].metadata?.name).toEqual(workflowTemplate.metadata?.name);
            expect(consoleDebugSpy).toBeCalledWith(
                `${workflowTemplate.metadata?.name} ${constants.ARGO_WORKFLOW_TEMPLATES_KIND} not present in the cluster. Installing v${packageVersion}`
            );
        });

        it("should create cronworkflows successfully", async () => {
            const cronWorkflow = await getResource<GenericK8sSpecType>("cronworkflows/default.yaml");
            const cronWorkflowList = await customK8sApi.listNamespacedCustomObject(
                constants.ARGO_K8S_API_GROUP,
                constants.ARGO_K8S_API_VERSION,
                namespace,
                `${constants.ARGO_CRON_WORKFLOW_KIND.toLowerCase()}s`,
                undefined,
                undefined,
                undefined,
                undefined,
                packageName.name ? PackageInfo.getPackageLabel(packageName.name) : undefined
            );

            expect(cronWorkflowList.response.statusCode).toEqual(200);
            expect(cronWorkflowList.body).toHaveProperty("items");
            expect(cronWorkflowList.body["items"]).toBeInstanceOf(Array);
            expect(cronWorkflowList.body["items"].length).toEqual(1);
            expect(cronWorkflowList.body["items"][0].metadata?.name).toEqual(cronWorkflow.metadata?.name);
            expect(consoleDebugSpy).toBeCalledWith(
                `${cronWorkflow.metadata?.name} ${constants.ARGO_CRON_WORKFLOW_KIND} not present in the cluster. Installing v${packageVersion}`
            );
        });

        it("should create pipelines successfully", async () => {
            const pipeline = await getResource<GenericK8sSpecType>("pipelines/default.yaml");
            const pipelineList = await customK8sApi.listNamespacedCustomObject(
                constants.ARGO_DATAFLOW_K8S_API_GROUP,
                constants.ARGO_K8S_API_VERSION,
                namespace,
                `${constants.ARGO_DATAFLOW_KIND.toLowerCase()}s`,
                undefined,
                undefined,
                undefined,
                undefined,
                packageName.name ? PackageInfo.getPackageLabel(packageName.name) : undefined
            );

            expect(pipelineList.response.statusCode).toEqual(200);
            expect(pipelineList.body).toHaveProperty("items");
            expect(pipelineList.body["items"]).toBeInstanceOf(Array);
            expect(pipelineList.body["items"].length).toEqual(1);
            expect(pipelineList.body["items"][0].metadata?.name).toEqual(pipeline.metadata?.name);
            expect(consoleDebugSpy).toBeCalledWith(
                `${pipeline.metadata?.name} ${constants.ARGO_DATAFLOW_KIND} not present in the cluster. Installing v${packageVersion}`
            );
        });
    });

    describe("patch-install all", () => {
        beforeEach(async () => {
            await yarg.parse("install .");
        });

        it("should patch configmaps successfully", async () => {
            // Check existence of fresh-install objects first
            const configmap = await getResource<V1ConfigMap>("configmaps/default.yaml");
            const configmapList = await coreK8sApi.listNamespacedConfigMap(
                namespace,
                undefined,
                undefined,
                undefined,
                undefined,
                packageName.name ? PackageInfo.getPackageLabel(packageName.name) : undefined
            );
            expect(configmapList.response.statusCode).toEqual(200);
            expect(configmapList.body.items.length).toEqual(1);
            expect(configmapList.body.items[0].metadata?.name).toEqual(configmap.metadata?.name);

            const resource = getResourceByName(configmapList.body.items, configmap.metadata?.name || "");
            const msgPrefix = `${configmap.metadata?.name} ${constants.CONFIGMAP_KIND} already present in the cluster.`;
            expect(consoleDebugSpy).toBeCalledWith(
                `${msgPrefix} v${resource?.version} is already latest version. Skipping update.`
            );
            // const newVersion = encode(packageJson.version);
            // const resourcePresentMsg = `${msgPrefix} v${resource?.version} installed is newer than v${newVersion}. Skipping update.`;
            // const resourceAbsentMsg = `${name} ${kind} not present in the cluster. Installing v${newVersion}`;
        });

        it("should patch secrets successfully", async () => {
            const secret = await getResource<V1Secret>("secrets/default.yaml");
            const secretList = await coreK8sApi.listNamespacedSecret(
                namespace,
                undefined,
                undefined,
                undefined,
                undefined,
                packageName.name ? PackageInfo.getPackageLabel(packageName.name) : undefined
            );

            expect(secretList.response.statusCode).toEqual(200);
            expect(secretList.body.items.length).toEqual(1);
            expect(secretList.body.items[0].metadata?.name).toEqual(secret.metadata?.name);

            const resource = getResourceByName(secretList.body.items, secret.metadata?.name || "");
            const msgPrefix = `${secret.metadata?.name} ${constants.SECRET_KIND} already present in the cluster.`;
            expect(consoleDebugSpy).toBeCalledWith(
                `${msgPrefix} v${resource?.version} is already latest version. Skipping update.`
            );
        });

        it("should patch workflow templates successfully", async () => {
            const workflowTemplate = await getResource<GenericK8sSpecType>("templates/default.yaml");
            const workflowTemplateList = await customK8sApi.listNamespacedCustomObject(
                constants.ARGO_K8S_API_GROUP,
                constants.ARGO_K8S_API_VERSION,
                namespace,
                `${constants.ARGO_WORKFLOW_TEMPLATES_KIND.toLowerCase()}s`,
                undefined,
                undefined,
                undefined,
                undefined,
                packageName.name ? PackageInfo.getPackageLabel(packageName.name) : undefined
            );

            expect(workflowTemplateList.response.statusCode).toEqual(200);
            expect(workflowTemplateList.body).toHaveProperty("items");
            expect(workflowTemplateList.body["items"]).toBeInstanceOf(Array);
            expect(workflowTemplateList.body["items"].length).toEqual(1);
            expect(workflowTemplateList.body["items"][0].metadata?.name).toEqual(workflowTemplate.metadata?.name);

            const resource = getResourceByName(
                workflowTemplateList.body["items"],
                workflowTemplate.metadata?.name || ""
            );
            const msgPrefix = `${workflowTemplate.metadata?.name} ${constants.ARGO_WORKFLOW_TEMPLATES_KIND} already present in the cluster.`;
            expect(consoleDebugSpy).toBeCalledWith(
                `${msgPrefix} v${resource?.version} is already latest version. Skipping update.`
            );
        });

        it("should patch cronworkflows successfully", async () => {
            const cronWorkflow = await getResource<GenericK8sSpecType>("cronworkflows/default.yaml");
            const cronWorkflowList = await customK8sApi.listNamespacedCustomObject(
                constants.ARGO_K8S_API_GROUP,
                constants.ARGO_K8S_API_VERSION,
                namespace,
                `${constants.ARGO_CRON_WORKFLOW_KIND.toLowerCase()}s`,
                undefined,
                undefined,
                undefined,
                undefined,
                packageName.name ? PackageInfo.getPackageLabel(packageName.name) : undefined
            );

            expect(cronWorkflowList.response.statusCode).toEqual(200);
            expect(cronWorkflowList.body).toHaveProperty("items");
            expect(cronWorkflowList.body["items"]).toBeInstanceOf(Array);
            expect(cronWorkflowList.body["items"].length).toEqual(1);
            expect(cronWorkflowList.body["items"][0].metadata?.name).toEqual(cronWorkflow.metadata?.name);

            const resource = getResourceByName(cronWorkflowList.body["items"], cronWorkflow.metadata?.name || "");
            const msgPrefix = `${cronWorkflow.metadata?.name} ${constants.ARGO_CRON_WORKFLOW_KIND} already present in the cluster.`;
            expect(consoleDebugSpy).toBeCalledWith(
                `${msgPrefix} v${resource?.version} is already latest version. Skipping update.`
            );
        });

        it("should patch pipelines successfully", async () => {
            const pipeline = await getResource<GenericK8sSpecType>("pipelines/default.yaml");
            const pipelineList = await customK8sApi.listNamespacedCustomObject(
                constants.ARGO_DATAFLOW_K8S_API_GROUP,
                constants.ARGO_K8S_API_VERSION,
                namespace,
                `${constants.ARGO_DATAFLOW_KIND.toLowerCase()}s`,
                undefined,
                undefined,
                undefined,
                undefined,
                packageName.name ? PackageInfo.getPackageLabel(packageName.name) : undefined
            );

            expect(pipelineList.response.statusCode).toEqual(200);
            expect(pipelineList.body).toHaveProperty("items");
            expect(pipelineList.body["items"]).toBeInstanceOf(Array);
            expect(pipelineList.body["items"].length).toEqual(1);
            expect(pipelineList.body["items"][0].metadata?.name).toEqual(pipeline.metadata?.name);

            const resource = getResourceByName(pipelineList.body["items"], pipeline.metadata?.name || "");
            const msgPrefix = `${pipeline.metadata?.name} ${constants.ARGO_DATAFLOW_KIND} already present in the cluster.`;
            expect(consoleDebugSpy).toBeCalledWith(
                `${msgPrefix} v${resource?.version} is already latest version. Skipping update.`
            );
        });
    });

    describe("patch-install all bump-version", () => {
        const consoleDebugSpy = jest.spyOn(console, "debug");

        beforeEach(async () => {
            shell.sed("-i", /0.0.1/g, NEW_VERSION_BUMP, `${TMP_DIR}/package.json`);
            await yarg.parse("install .");
        });

        it("should replace configmaps to newer package version successfully", async () => {
            // Check existence of fresh-install objects first
            const configmap = await getResource<V1ConfigMap>("configmaps/default.yaml");
            const configmapList = await coreK8sApi.listNamespacedConfigMap(
                namespace,
                undefined,
                undefined,
                undefined,
                undefined,
                packageName.name ? PackageInfo.getPackageLabel(packageName.name) : undefined
            );
            expect(configmapList.response.statusCode).toEqual(200);
            expect(configmapList.body.items.length).toEqual(1);
            expect(configmapList.body.items[0].metadata?.name).toEqual(configmap.metadata?.name);

            const resource = getResourceByName(configmapList.body["items"], configmap.metadata?.name || "");
            const msgPrefix = `${configmap.metadata?.name} ${constants.CONFIGMAP_KIND} already present in the cluster.`;
            expect(consoleDebugSpy).toBeCalledWith(
                `${msgPrefix} v${resource?.version} will be deleted and replaced with v${packageVersion}`
            );
        });

        it("should replace secrets to newer package version successfully", async () => {
            const secret = await getResource<V1Secret>("secrets/default.yaml");
            const secretList = await coreK8sApi.listNamespacedSecret(
                namespace,
                undefined,
                undefined,
                undefined,
                undefined,
                packageName.name ? PackageInfo.getPackageLabel(packageName.name) : undefined
            );

            expect(secretList.response.statusCode).toEqual(200);
            expect(secretList.body.items.length).toEqual(1);
            expect(secretList.body.items[0].metadata?.name).toEqual(secret.metadata?.name);

            const resource = getResourceByName(secretList.body["items"], secret.metadata?.name || "");
            const msgPrefix = `${secret.metadata?.name} ${constants.SECRET_KIND} already present in the cluster.`;
            expect(consoleDebugSpy).toBeCalledWith(
                `${msgPrefix} v${resource?.version} will be deleted and replaced with v${packageVersion}`
            );
        });

        it("should replace workflow to newer package version templates successfully", async () => {
            const workflowTemplate = await getResource<GenericK8sSpecType>("templates/default.yaml");
            const workflowTemplateList = await customK8sApi.listNamespacedCustomObject(
                constants.ARGO_K8S_API_GROUP,
                constants.ARGO_K8S_API_VERSION,
                namespace,
                `${constants.ARGO_WORKFLOW_TEMPLATES_KIND.toLowerCase()}s`,
                undefined,
                undefined,
                undefined,
                undefined,
                packageName.name ? PackageInfo.getPackageLabel(packageName.name) : undefined
            );

            expect(workflowTemplateList.response.statusCode).toEqual(200);
            expect(workflowTemplateList.body).toHaveProperty("items");
            expect(workflowTemplateList.body["items"]).toBeInstanceOf(Array);
            expect(workflowTemplateList.body["items"].length).toEqual(1);
            expect(workflowTemplateList.body["items"][0].metadata?.name).toEqual(workflowTemplate.metadata?.name);

            const resource = getResourceByName(
                workflowTemplateList.body["items"],
                workflowTemplate.metadata?.name || ""
            );
            const msgPrefix = `${workflowTemplate.metadata?.name} ${constants.ARGO_WORKFLOW_TEMPLATES_KIND} already present in the cluster.`;
            expect(consoleDebugSpy).toBeCalledWith(
                `${msgPrefix} v${resource?.version} will be deleted and replaced with v${packageVersion}`
            );
        });

        it("should replace cronworkflows to newer package version successfully", async () => {
            const cronWorkflow = await getResource<GenericK8sSpecType>("cronworkflows/default.yaml");
            const cronWorkflowList = await customK8sApi.listNamespacedCustomObject(
                constants.ARGO_K8S_API_GROUP,
                constants.ARGO_K8S_API_VERSION,
                namespace,
                `${constants.ARGO_CRON_WORKFLOW_KIND.toLowerCase()}s`,
                undefined,
                undefined,
                undefined,
                undefined,
                packageName.name ? PackageInfo.getPackageLabel(packageName.name) : undefined
            );

            expect(cronWorkflowList.response.statusCode).toEqual(200);
            expect(cronWorkflowList.body).toHaveProperty("items");
            expect(cronWorkflowList.body["items"]).toBeInstanceOf(Array);
            expect(cronWorkflowList.body["items"].length).toEqual(1);
            expect(cronWorkflowList.body["items"][0].metadata?.name).toEqual(cronWorkflow.metadata?.name);

            const resource = getResourceByName(cronWorkflowList.body["items"], cronWorkflow.metadata?.name || "");
            const msgPrefix = `${cronWorkflow.metadata?.name} ${constants.ARGO_CRON_WORKFLOW_KIND} already present in the cluster.`;
            expect(consoleDebugSpy).toBeCalledWith(
                `${msgPrefix} v${resource?.version} will be deleted and replaced with v${packageVersion}`
            );
        });

        it("should replace pipelines to newer package version successfully", async () => {
            const pipeline = await getResource<GenericK8sSpecType>("pipelines/default.yaml");
            const pipelineList = await customK8sApi.listNamespacedCustomObject(
                constants.ARGO_DATAFLOW_K8S_API_GROUP,
                constants.ARGO_K8S_API_VERSION,
                namespace,
                `${constants.ARGO_DATAFLOW_KIND.toLowerCase()}s`,
                undefined,
                undefined,
                undefined,
                undefined,
                packageName.name ? PackageInfo.getPackageLabel(packageName.name) : undefined
            );

            expect(pipelineList.response.statusCode).toEqual(200);
            expect(pipelineList.body).toHaveProperty("items");
            expect(pipelineList.body["items"]).toBeInstanceOf(Array);
            expect(pipelineList.body["items"].length).toEqual(1);
            expect(pipelineList.body["items"][0].metadata?.name).toEqual(pipeline.metadata?.name);

            const resource = getResourceByName(pipelineList.body["items"], pipeline.metadata?.name || "");
            const msgPrefix = `${pipeline.metadata?.name} ${constants.ARGO_DATAFLOW_KIND} already present in the cluster.`;
            expect(consoleDebugSpy).toBeCalledWith(
                `${msgPrefix} v${resource?.version} will be deleted and replaced with v${packageVersion}`
            );
        });
    });
});
