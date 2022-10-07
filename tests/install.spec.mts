import { afterEach, beforeEach, describe, expect, it, jest, beforeAll, afterAll } from "@jest/globals";
import { CoreV1Api, CustomObjectsApi, KubeConfig, loadYaml, V1ConfigMap, V1Secret } from "@kubernetes/client-node";
import { readFile } from "fs/promises";
import { IncomingMessage } from "http";
import npa from "npm-package-arg";
import shell from "shelljs";
import yarg from "../bin/install.mjs";
import { constants } from "../lib/constants.mjs";
import { uninstall } from "../lib/index.mjs";
import { packageNameFromPath } from "../lib/install.mjs";
import { GenericK8sSpecType, getResourceByName } from "../lib/k8s.mjs";
import { encode, PackageInfo } from "../lib/models/info.mjs";
import { Resource } from "../lib/models/resource.mjs";

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
    const consoleLogSpy = jest.spyOn(console, "log");
    const consoleDebugSpy = jest.spyOn(console, "debug");

    beforeAll(async () => {
        jest.resetModules();
        shell.rm("-Rf", TMP_DIR);
        shell.mkdir(TMP_DIR);
        shell.cp("-R", `${MOCK_PACKAGE_DIR}/*`, `${TMP_DIR}/`);
        shell.cd(TMP_DIR);
        packageName = npa(packageNameFromPath(TMP_DIR));
        packageJson = JSON.parse(await readFile(`${TMP_DIR}/package.json`, "utf-8"));
        packageVersion = encode(packageJson.version);
    });

    afterEach(() => {
        // jest.resetAllMocks();
        // shell.cd("-");
    });

    afterAll(async () => {
        await uninstall(namespace, packageName.name, false);
    });

    describe("fresh-install all", () => {
        beforeAll(async () => {
            await yarg.parse(`install . -x -n ${namespace}`);
            packageJson = JSON.parse(await readFile(`${TMP_DIR}/package.json`, "utf-8"));
            packageVersion = encode(packageJson.version);
        });

        it("should show installing message", () => {
            expect(consoleLogSpy).toBeCalledWith(`Installing package ${packageName}`);
        });

        it("should create configmaps successfully", async () => {
            const object = await getResource<V1ConfigMap>("configmaps/default.yaml");
            const persisted = await coreK8sApi.readNamespacedConfigMap(object.metadata?.name || "", namespace);

            expect(persisted.response.statusCode).toEqual(200);
            expect(consoleDebugSpy).toBeCalledWith(
                `${object.metadata?.name} ${constants.CONFIGMAP_KIND} not present in the cluster. Installing v${packageVersion}`
            );
        });

        // it("should create secrets successfully", async () => {
        //     const object = await getResource<V1Secret>("secrets/default.yaml");
        //     const persisted = await coreK8sApi.readNamespacedSecret(object.metadata?.name || "", namespace);

        //     expect(persisted.response.statusCode).toEqual(200);
        //     expect(consoleDebugSpy).toBeCalledWith(
        //         `${object.metadata?.name} ${constants.SECRET_KIND} not present in the cluster. Installing v${packageVersion}`
        //     );
        // });

        // it("should create workflow templates successfully", async () => {
        //     const object = await getResource<GenericK8sSpecType>("templates/default.yaml");
        //     const persisted = await customK8sApi.getNamespacedCustomObject(
        //         constants.ARGO_K8S_API_GROUP,
        //         constants.ARGO_K8S_API_VERSION,
        //         namespace,
        //         `${constants.ARGO_WORKFLOW_TEMPLATES_KIND.toLowerCase()}s`,
        //         object.metadata?.name || "",
        //     );

        //     expect(persisted.response.statusCode).toEqual(200);
        //     expect(consoleDebugSpy).toBeCalledWith(
        //         `${object.metadata?.name} ${constants.ARGO_WORKFLOW_TEMPLATES_KIND} not present in the cluster. Installing v${packageVersion}`
        //     );
        // });

        // it("should create cronworkflows successfully", async () => {
        //     const object = await getResource<GenericK8sSpecType>("cronworkflows/default.yaml");
        //     const persisted = await customK8sApi.getNamespacedCustomObject(
        //         constants.ARGO_K8S_API_GROUP,
        //         constants.ARGO_K8S_API_VERSION,
        //         namespace,
        //         `${constants.ARGO_CRON_WORKFLOW_KIND.toLowerCase()}s`,
        //         object.metadata?.name || "",
        //     );

        //     expect(persisted.response.statusCode).toEqual(200);
        //     expect(consoleDebugSpy).toBeCalledWith(
        //         `${object.metadata?.name} ${constants.ARGO_CRON_WORKFLOW_KIND} not present in the cluster. Installing v${packageVersion}`
        //     );
        // });

        // it("should create pipelines successfully", async () => {
        //     const object = await getResource<GenericK8sSpecType>("pipelines/default.yaml");
        //     const persisted = await customK8sApi.getNamespacedCustomObject(
        //         constants.ARGO_DATAFLOW_K8S_API_GROUP,
        //         constants.ARGO_K8S_API_VERSION,
        //         namespace,
        //         `${constants.ARGO_DATAFLOW_KIND.toLowerCase()}s`,
        //         object.metadata?.name || "",
        //     );

        //     expect(persisted.response.statusCode).toEqual(200);
        //     expect(consoleDebugSpy).toBeCalledWith(
        //         `${object.metadata?.name} ${constants.ARGO_DATAFLOW_KIND} not present in the cluster. Installing v${packageVersion}`
        //     );
        // });
    });

    describe.skip("skip update all", () => {
        beforeAll(async () => {
            await yarg.parse(`install . -x -n ${namespace}`);
        });

        it("should patch configmaps successfully", async () => {
            // Check existence of fresh-install objects first
            const object = await getResource<V1ConfigMap>("configmaps/default.yaml");
            const persisted = await coreK8sApi.readNamespacedConfigMap(object.metadata?.name || "", namespace);
            expect(persisted.response.statusCode).toEqual(200);
            expect((persisted.body.metadata?.labels as any)[constants.ARGOPM_LIBRARY_VERSION_LABEL]).toEqual(packageVersion);

            const resource = new Resource(persisted.body);
            const msgPrefix = `${object.metadata?.name} ${constants.CONFIGMAP_KIND} already present in the cluster.`;
            expect(consoleDebugSpy).toBeCalledWith(
                `${msgPrefix} v${resource?.version} is already latest version. Skipping update.`
            );
            // const newVersion = encode(packageJson.version);
            // const resourcePresentMsg = `${msgPrefix} v${resource?.version} installed is newer than v${newVersion}. Skipping update.`;
            // const resourceAbsentMsg = `${name} ${kind} not present in the cluster. Installing v${newVersion}`;
        });

        // it("should patch secrets successfully", async () => {
        //     const object = await getResource<V1Secret>("secrets/default.yaml");
        //     const persisted = await coreK8sApi.readNamespacedSecret(object.metadata?.name || "", namespace);
        //     expect(persisted.response.statusCode).toEqual(200);
        //     expect((persisted.body.metadata?.labels as any)[constants.ARGOPM_LIBRARY_VERSION_LABEL]).toEqual(packageVersion);

        //     const resource = new Resource(persisted.body);
        //     const msgPrefix = `${object.metadata?.name} ${constants.SECRET_KIND} already present in the cluster.`;
        //     expect(consoleDebugSpy).toBeCalledWith(
        //         `${msgPrefix} v${resource?.version} is already latest version. Skipping update.`
        //     );
        // });

        // it("should patch workflow templates successfully", async () => {
        //     const object = await getResource<GenericK8sSpecType>("templates/default.yaml");
        //     const persisted = await customK8sApi.getNamespacedCustomObject(
        //         constants.ARGO_K8S_API_GROUP,
        //         constants.ARGO_K8S_API_VERSION,
        //         namespace,
        //         `${constants.ARGO_WORKFLOW_TEMPLATES_KIND.toLowerCase()}s`,
        //         object.metadata?.name || "",
        //     ) as { response: IncomingMessage, body: GenericK8sSpecType };

        //     expect(persisted.response.statusCode).toEqual(200);
        //     expect((persisted.body.metadata?.labels as any)[constants.ARGOPM_LIBRARY_VERSION_LABEL]).toEqual(packageVersion);

        //     const resource = new Resource(persisted.body);
        //     const msgPrefix = `${object.metadata?.name} ${constants.ARGO_WORKFLOW_TEMPLATES_KIND} already present in the cluster.`;
        //     expect(consoleDebugSpy).toBeCalledWith(
        //         `${msgPrefix} v${resource?.version} is already latest version. Skipping update.`
        //     );
        // });

        // it("should patch cronworkflows successfully", async () => {
        //     const object = await getResource<GenericK8sSpecType>("cronworkflows/default.yaml");
        //     const persisted = await customK8sApi.getNamespacedCustomObject(
        //         constants.ARGO_K8S_API_GROUP,
        //         constants.ARGO_K8S_API_VERSION,
        //         namespace,
        //         `${constants.ARGO_CRON_WORKFLOW_KIND.toLowerCase()}s`,
        //         object.metadata?.name || "",
        //     ) as { response: IncomingMessage, body: GenericK8sSpecType };

        //     expect(persisted.response.statusCode).toEqual(200);
        //     expect((persisted.body.metadata?.labels as any)[constants.ARGOPM_LIBRARY_VERSION_LABEL]).toEqual(packageVersion);

        //     const resource = new Resource(persisted.body);
        //     const msgPrefix = `${object.metadata?.name} ${constants.ARGO_CRON_WORKFLOW_KIND} already present in the cluster.`;
        //     expect(consoleDebugSpy).toBeCalledWith(
        //         `${msgPrefix} v${resource?.version} is already latest version. Skipping update.`
        //     );
        // });

        // it("should patch pipelines successfully", async () => {
        //     const object = await getResource<GenericK8sSpecType>("pipelines/default.yaml");
        //     const persisted = await customK8sApi.getNamespacedCustomObject(
        //         constants.ARGO_DATAFLOW_K8S_API_GROUP,
        //         constants.ARGO_K8S_API_VERSION,
        //         namespace,
        //         `${constants.ARGO_DATAFLOW_KIND.toLowerCase()}s`,
        //         object.metadata?.name || "",
        //     ) as { response: IncomingMessage, body: GenericK8sSpecType };

        //     expect(persisted.response.statusCode).toEqual(200);
        //     expect((persisted.body.metadata?.labels as any)[constants.ARGOPM_LIBRARY_VERSION_LABEL]).toEqual(packageVersion);

        //     const resource = new Resource(persisted.body);
        //     const msgPrefix = `${object.metadata?.name} ${constants.ARGO_DATAFLOW_KIND} already present in the cluster.`;
        //     expect(consoleDebugSpy).toBeCalledWith(
        //         `${msgPrefix} v${resource?.version} is already latest version. Skipping update.`
        //     );
        // });
    });

    describe.skip("patch all bump-version", () => {

        beforeAll(async () => {
            shell.sed("-i", /0.0.1/g, NEW_VERSION_BUMP, `${TMP_DIR}/package.json`);
            packageJson = JSON.parse(await readFile(`${TMP_DIR}/package.json`, "utf-8"));
            packageVersion = encode(packageJson.version);
            await yarg.parse(`install . -x -n ${namespace}`);
        });

        it("should replace configmaps to newer package version successfully", async () => {
            const object = await getResource<V1ConfigMap>("configmaps/default.yaml");
            const persisted = await coreK8sApi.readNamespacedConfigMap(object.metadata?.name || "", namespace);
            expect(persisted.response.statusCode).toEqual(200);
            expect(persisted.body.metadata).toHaveProperty("labels");
            expect((persisted.body.metadata?.labels as any)[constants.ARGOPM_LIBRARY_VERSION_LABEL]).toEqual(NEW_VERSION_BUMP);

            // expect(persisted.body.metadata).toEqual(true);

            const resource = new Resource(persisted.body);
            const msgPrefix = `${object.metadata?.name} ${constants.CONFIGMAP_KIND} already present in the cluster.`;
            expect(consoleDebugSpy).toBeCalledWith(
                `${msgPrefix} v0.0.1 will be patch updated to v${packageVersion}`
            );
        });

        // it("should replace secrets to newer package version successfully", async () => {
        //     const object = await getResource<V1Secret>("secrets/default.yaml");
        //     const persisted = await coreK8sApi.readNamespacedSecret(object.metadata?.name || "", namespace);
        //     expect(persisted.response.statusCode).toEqual(200);
        // expect(persisted.body.metadata).toHaveProperty("labels");
        //     expect((persisted.body.metadata?.labels as any)[constants.ARGOPM_LIBRARY_VERSION_LABEL]).toEqual(NEW_VERSION_BUMP);

        //     const resource = new Resource(persisted.body);
        //     const msgPrefix = `${object.metadata?.name} ${constants.SECRET_KIND} already present in the cluster.`;
        //     expect(consoleDebugSpy).toBeCalledWith(
        //         `${msgPrefix} v0.0.1 will be patch updated to v${packageVersion}`
        //     );
        // });

        // it("should replace workflow to newer package version templates successfully", async () => {
        //     const object = await getResource<GenericK8sSpecType>("templates/default.yaml");
        //     const persisted = await customK8sApi.getNamespacedCustomObject(
        //         constants.ARGO_K8S_API_GROUP,
        //         constants.ARGO_K8S_API_VERSION,
        //         namespace,
        //         `${constants.ARGO_WORKFLOW_TEMPLATES_KIND.toLowerCase()}s`,
        //         object.metadata?.name || "",
        //     ) as { response: IncomingMessage, body: GenericK8sSpecType };

        //     expect(persisted.response.statusCode).toEqual(200);
        // expect(persisted.body.metadata).toHaveProperty("labels");
        //     expect((persisted.body.metadata?.labels as any)[constants.ARGOPM_LIBRARY_VERSION_LABEL]).toEqual(NEW_VERSION_BUMP);

        //     const resource = new Resource(persisted.body);
        //     const msgPrefix = `${object.metadata?.name} ${constants.ARGO_WORKFLOW_TEMPLATES_KIND} already present in the cluster.`;
        //     expect(consoleDebugSpy).toBeCalledWith(
        //         `${msgPrefix} v0.0.1 will be patch updated to v${packageVersion}`
        //     );
        // });

        // it("should replace cronworkflows to newer package version successfully", async () => {
        //     const object = await getResource<GenericK8sSpecType>("cronworkflows/default.yaml");
        //     const persisted = await customK8sApi.getNamespacedCustomObject(
        //         constants.ARGO_K8S_API_GROUP,
        //         constants.ARGO_K8S_API_VERSION,
        //         namespace,
        //         `${constants.ARGO_CRON_WORKFLOW_KIND.toLowerCase()}s`,
        //         object.metadata?.name || "",
        //     ) as { response: IncomingMessage, body: GenericK8sSpecType };

        //     expect(persisted.response.statusCode).toEqual(200);
        // expect(persisted.body.metadata).toHaveProperty("labels");
        //     expect((persisted.body.metadata?.labels as any)[constants.ARGOPM_LIBRARY_VERSION_LABEL]).toEqual(NEW_VERSION_BUMP);

        //     const resource = new Resource(persisted.body);
        //     const msgPrefix = `${object.metadata?.name} ${constants.ARGO_CRON_WORKFLOW_KIND} already present in the cluster.`;
        //     expect(consoleDebugSpy).toBeCalledWith(
        //         `${msgPrefix} v0.0.1 will be patch updated to v${packageVersion}`
        //     );
        // });

        // it("should replace pipelines to newer package version successfully", async () => {
        //     const object = await getResource<GenericK8sSpecType>("pipelines/default.yaml");
        //     const persisted = await customK8sApi.getNamespacedCustomObject(
        //         constants.ARGO_DATAFLOW_K8S_API_GROUP,
        //         constants.ARGO_K8S_API_VERSION,
        //         namespace,
        //         `${constants.ARGO_DATAFLOW_KIND.toLowerCase()}s`,
        //         object.metadata?.name || "",
        //     ) as { response: IncomingMessage, body: GenericK8sSpecType };

        //     expect(persisted.response.statusCode).toEqual(200);
        // expect(persisted.body.metadata).toHaveProperty("labels");
        //     expect((persisted.body.metadata?.labels as any)[constants.ARGOPM_LIBRARY_VERSION_LABEL]).toEqual(packageVersion);

        //     const resource = new Resource(persisted.body);
        //     const msgPrefix = `${object.metadata?.name} ${constants.ARGO_DATAFLOW_KIND} already present in the cluster.`;
        //     expect(consoleDebugSpy).toBeCalledWith(
        //         `${msgPrefix} v0.0.1 will be deleted and replaced with v${packageVersion}`
        //     );
        // });
    });

    describe("install with dependencies", () => {
        const packageToAdd = "giphy";

        beforeAll(async () => {
            shell.sed("-i", /0.0.1/g, NEW_VERSION_BUMP, `${TMP_DIR}/package.json`);
            packageJson = JSON.parse(await readFile(`${TMP_DIR}/package.json`, "utf-8"));
            packageVersion = encode(packageJson.version);
            await yarg.parse(`install ${packageToAdd} --save -x -n ${namespace}`);
            await yarg.parse(`install . -x -n ${namespace}`);
        });

        it("should install with giphy package as dependency successfully", async () => {
            const persisted = await customK8sApi.getNamespacedCustomObject(
                constants.ARGO_WORKFLOW_TEMPLATES_KIND,
                constants.ARGO_K8S_API_VERSION,
                namespace,
                `${constants.ARGO_CRON_WORKFLOW_KIND.toLowerCase()}s`,
                packageToAdd,
            ) as { response: IncomingMessage, body: GenericK8sSpecType };

            expect(persisted.response.statusCode).toEqual(200);
            expect(persisted.body.metadata).toHaveProperty("labels");
            expect((persisted.body.metadata?.labels as any)[constants.ARGOPM_LIBRARY_PARENT_LABEL]).toEqual(packageToAdd);
            expect((persisted.body.metadata?.labels as any)[constants.ARGOPM_LIBRARY_PARENT_LABEL]).toEqual(packageName);
        });

    });
});
