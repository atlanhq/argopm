import { GetObjectCommand } from "@aws-sdk/client-s3";
import { afterAll, beforeAll, describe, expect, it, jest } from "@jest/globals";
import { CoreV1Api, CustomObjectsApi, KubeConfig, V1ConfigMap, V1Secret } from "@kubernetes/client-node";
import { writeFileSync } from "fs";
import { readFile } from "fs/promises";
import { IncomingMessage } from "http";
import npa from "npm-package-arg";
import shell from "shelljs";
import yarg from "../bin/install.mjs";
import { constants } from "../lib/constants.mjs";
import { initHelp } from "../lib/help.mjs";
import { uninstall } from "../lib/index.mjs";
import { packageNameFromPath } from "../lib/install.mjs";
import { GenericK8sSpecType } from "../lib/k8s.mjs";
import { encode, PackageInfo } from "../lib/models/info.mjs";
import { Package } from "../lib/models/package.mjs";
import { Resource } from "../lib/models/resource.mjs";
import { S3 } from "../lib/s3.mjs";
import { getResourceFromYaml } from "../lib/utils.mjs";

const kc = new KubeConfig();
kc.loadFromDefault();
const coreK8sApi = kc.makeApiClient(CoreV1Api);
const customK8sApi = kc.makeApiClient(CustomObjectsApi);

const NAMESPACE = "argo";
const CURRENT_DIR = shell.pwd();
const MOCK_PACKAGE_DIR = `${CURRENT_DIR.stdout}/tests/fixtures/mock-package`;
const TMP_DIR = "/tmp/test-install-package";
const NEW_VERSION_BUMP = "0.0.2";

describe("argopm init", () => {
    const tmpDir = "/tmp/test-init-package";

    it("should run init successfully", async () => {
        shell.rm("-Rf", tmpDir);
        shell.mkdir(tmpDir);
        shell.cd(tmpDir);

        const consoleSpy = jest.spyOn(console, "log");

        await yarg.parse("init .");
        expect(shell.test("-e", "package.json")).toBe(true);

        const outputDirLs = shell.ls(`${tmpDir}/`);
        const inputDirLs = shell.ls(`${CURRENT_DIR.stdout}/lib/static/package/`);
        const packageName = npa(packageNameFromPath(tmpDir));
        expect(consoleSpy).toBeCalledWith(
            `Installing from the current directory (/private${tmpDir}) with the package name "${packageName.name}"...`
        );
        expect(consoleSpy).toBeCalledWith(initHelp.replace(/NAME/g, packageName.name || ""));
        expect(outputDirLs).toEqual(expect.arrayContaining(inputDirLs));
    });
});

describe("argopm non-init", () => {
    let packageName;
    let packageJson;
    let packageVersion;
    const consoleLogSpy = jest.spyOn(console, "log");
    const consoleDebugSpy = jest.spyOn(console, "debug");

    beforeAll(async () => {
        jest.useFakeTimers();
        jest.resetModules();
        shell.rm("-Rf", TMP_DIR);
        shell.mkdir(TMP_DIR);
        shell.cp("-R", `${MOCK_PACKAGE_DIR}/*`, `${TMP_DIR}/`);
        shell.cd(TMP_DIR);
        packageName = npa(packageNameFromPath(TMP_DIR));
        packageJson = JSON.parse(await readFile(`${TMP_DIR}/package.json`, "utf-8"));
        packageVersion = encode(packageJson.version);
    });

    afterAll(async () => {
        try {
            await uninstall(NAMESPACE, packageName.name, false, false);
        } catch (err) {
            console.log(err);
        }
    });

    describe("fresh-install all dry-run", () => {
        beforeAll(async () => {
            await yarg.parse(`install . -x -n ${NAMESPACE} --dry-run`);
            packageJson = JSON.parse(await readFile(`${TMP_DIR}/package.json`, "utf-8"));
            packageVersion = encode(packageJson.version);
        });

        it("should show installing message with dry-run tag", () => {
            expect(consoleDebugSpy).toBeCalledWith(`Installing package ${packageName} (dry-run)`);
        });

        it("should show installing configmaps with dry-run tag successfully", async () => {
            setTimeout(async () => {
                const object = await getResourceFromYaml<V1ConfigMap>("configmaps/default.yaml");
                const persisted = await coreK8sApi.readNamespacedConfigMap(object.metadata?.name || "", NAMESPACE);

                expect(persisted.response.statusCode).toEqual(404);
                expect(consoleDebugSpy).toBeCalledWith(
                    `${object.metadata?.name} ${constants.CONFIGMAP_KIND} not present in the cluster. Installing v${packageVersion} (dry-run)`
                );
            }, 2000);
        });

        it("should show installing secrets with dry-run tag successfully", async () => {
            setTimeout(async () => {
                const object = await getResourceFromYaml<V1Secret>("secrets/default.yaml");
                const persisted = await coreK8sApi.readNamespacedSecret(object.metadata?.name || "", NAMESPACE);

                expect(persisted.response.statusCode).toEqual(404);
                expect(consoleDebugSpy).toBeCalledWith(
                    `${object.metadata?.name} ${constants.SECRET_KIND} not present in the cluster. Installing v${packageVersion} (dry-run)`
                );
            }, 2000);
        });

        it("should create show installing templates with dry-run tag successfully", async () => {
            setTimeout(async () => {
                const object = await getResourceFromYaml<GenericK8sSpecType>("templates/default.yaml");
                const persisted = await customK8sApi.getNamespacedCustomObject(
                    constants.ARGO_K8S_API_GROUP,
                    constants.ARGO_K8S_API_VERSION,
                    NAMESPACE,
                    constants.ARGO_WORKFLOW_TEMPLATES_PLURAL,
                    object.metadata?.name || ""
                );

                expect(persisted.response.statusCode).toEqual(404);
                expect(consoleDebugSpy).toBeCalledWith(
                    `${object.metadata?.name} ${constants.ARGO_WORKFLOW_TEMPLATES_KIND} not present in the cluster. Installing v${packageVersion} (dry-run)`
                );
            }, 2000);
        });

        it("should show installing cronworkflows with dry-run tag successfully", async () => {
            setTimeout(async () => {
                const object = await getResourceFromYaml<GenericK8sSpecType>("cronworkflows/default.yaml");
                const persisted = await customK8sApi.getNamespacedCustomObject(
                    constants.ARGO_K8S_API_GROUP,
                    constants.ARGO_K8S_API_VERSION,
                    NAMESPACE,
                    constants.ARGO_WORKFLOWS_PLURAL,
                    object.metadata?.name || ""
                );

                expect(persisted.response.statusCode).toEqual(404);
                expect(consoleDebugSpy).toBeCalledWith(
                    `${object.metadata?.name} ${constants.ARGO_CRON_WORKFLOW_KIND} not present in the cluster. Installing v${packageVersion} (dry-run)`
                );
            }, 2000);
        });

        it("should show installing pipelines with dry-run tag successfully", async () => {
            setTimeout(async () => {
                const object = await getResourceFromYaml<GenericK8sSpecType>("pipelines/default.yaml");
                const persisted = await customK8sApi.getNamespacedCustomObject(
                    constants.ARGO_DATAFLOW_K8S_API_GROUP,
                    constants.ARGO_K8S_API_VERSION,
                    NAMESPACE,
                    constants.ARGO_PIPELINES_PLURAL,
                    object.metadata?.name || ""
                );

                expect(persisted.response.statusCode).toEqual(404);
                expect(consoleDebugSpy).toBeCalledWith(
                    `${object.metadata?.name} ${constants.ARGO_DATAFLOW_KIND} not present in the cluster. Installing v${packageVersion} (dry-run)`
                );
            }, 2000);
        });
    });

    describe("fresh-install all", () => {
        beforeAll(async () => {
            await yarg.parse(`install . -x -n ${NAMESPACE}`);
            packageJson = JSON.parse(await readFile(`${TMP_DIR}/package.json`, "utf-8"));
            packageVersion = encode(packageJson.version);
        });

        it("should show installing message", () => {
            expect(consoleDebugSpy).toBeCalledWith(`Installing package ${packageName}`);
        });

        it("should create configmaps successfully", async () => {
            setTimeout(async () => {
                const object = await getResourceFromYaml<V1ConfigMap>("configmaps/default.yaml");
                const persisted = await coreK8sApi.readNamespacedConfigMap(object.metadata?.name || "", NAMESPACE);

                expect(persisted.response.statusCode).toEqual(200);
                expect(consoleDebugSpy).toBeCalledWith(
                    `${object.metadata?.name} ${constants.CONFIGMAP_KIND} not present in the cluster. Installing v${packageVersion}`
                );
            }, 2000);
        });

        it("should create secrets successfully", async () => {
            setTimeout(async () => {
                const object = await getResourceFromYaml<V1Secret>("secrets/default.yaml");
                const persisted = await coreK8sApi.readNamespacedSecret(object.metadata?.name || "", NAMESPACE);

                expect(persisted.response.statusCode).toEqual(200);
                expect(consoleDebugSpy).toBeCalledWith(
                    `${object.metadata?.name} ${constants.SECRET_KIND} not present in the cluster. Installing v${packageVersion}`
                );
            }, 2000);
        });

        it("should create workflow templates successfully", async () => {
            setTimeout(async () => {
                const object = await getResourceFromYaml<GenericK8sSpecType>("templates/default.yaml");
                const persisted = await customK8sApi.getNamespacedCustomObject(
                    constants.ARGO_K8S_API_GROUP,
                    constants.ARGO_K8S_API_VERSION,
                    NAMESPACE,
                    constants.ARGO_WORKFLOW_TEMPLATES_PLURAL,
                    object.metadata?.name || ""
                );

                expect(persisted.response.statusCode).toEqual(200);
                expect(consoleDebugSpy).toBeCalledWith(
                    `${object.metadata?.name} ${constants.ARGO_WORKFLOW_TEMPLATES_KIND} not present in the cluster. Installing v${packageVersion}`
                );
            }, 2000);
        });

        it("should create cronworkflows successfully", async () => {
            setTimeout(async () => {
                const object = await getResourceFromYaml<GenericK8sSpecType>("cronworkflows/default.yaml");
                const persisted = await customK8sApi.getNamespacedCustomObject(
                    constants.ARGO_K8S_API_GROUP,
                    constants.ARGO_K8S_API_VERSION,
                    NAMESPACE,
                    constants.ARGO_CRON_WORKFLOW_PLURAL,
                    object.metadata?.name || ""
                );

                expect(persisted.response.statusCode).toEqual(200);
                expect(consoleDebugSpy).toBeCalledWith(
                    `${object.metadata?.name} ${constants.ARGO_CRON_WORKFLOW_KIND} not present in the cluster. Installing v${packageVersion}`
                );
            }, 2000);
        });

        it("should create pipelines successfully", async () => {
            setTimeout(async () => {
                const object = await getResourceFromYaml<GenericK8sSpecType>("pipelines/default.yaml");
                const persisted = await customK8sApi.getNamespacedCustomObject(
                    constants.ARGO_DATAFLOW_K8S_API_GROUP,
                    constants.ARGO_K8S_API_VERSION,
                    NAMESPACE,
                    constants.ARGO_PIPELINES_PLURAL,
                    object.metadata?.name || ""
                );

                expect(persisted.response.statusCode).toEqual(200);
                expect(consoleDebugSpy).toBeCalledWith(
                    `${object.metadata?.name} ${constants.ARGO_DATAFLOW_KIND} not present in the cluster. Installing v${packageVersion}`
                );
            }, 2000);
        });
    });

    describe("show info", () => {
        it("should show information the package successfully", async () => {
            setTimeout(async () => {
                const consoleSpy = jest.spyOn(console, "log");

                await yarg.parse(`info --no-color ${packageName.name}`);

                const configmap = await getResourceFromYaml<V1ConfigMap>("configmaps/default.yaml");
                const secret = await getResourceFromYaml<V1Secret>("secrets/default.yaml");
                const workflowTemplate = await getResourceFromYaml<GenericK8sSpecType>("templates/default.yaml");
                const cronWorkflow = await getResourceFromYaml<GenericK8sSpecType>("cronworkflows/default.yaml");
                const pipeline = await getResourceFromYaml<GenericK8sSpecType>("pipelines/default.yaml");

                let info = `Package Info:
Name: ${packageName.name}
Version: ${packageVersion}
Parent Dependency: ${packageName.name}@${packageVersion}
Package Registry: https://packages.atlan.com

Executable: true
Arguments:
- Parameters: 

Templates: 
- ${workflowTemplate.spec?.entrypoint}

Pipelines: 
- ${pipeline.metadata?.name}

Config Maps: 
- ${configmap.metadata?.name}

Secrets: 
- ${secret.metadata?.name}

Cron Workflows: 
- Name: ${cronWorkflow.metadata?.name}, Schedule: * * * * *, Timezone: undefined
`;

                expect(consoleSpy).toBeCalledWith(info);
                consoleSpy.mockRestore();
            }, 3000);
        });
    });

    describe("skip update all", () => {
        beforeAll(async () => {
            await yarg.parse(`install . -x -n ${NAMESPACE}`);
        });

        it("should force-patch configmaps successfully", async () => {
            // Check existence of fresh-install objects first
            setTimeout(async () => {
                const object = await getResourceFromYaml<V1ConfigMap>("configmaps/default.yaml");
                const persisted = await coreK8sApi.readNamespacedConfigMap(object.metadata?.name || "", NAMESPACE);
                expect(persisted.response.statusCode).toEqual(200);
                expect((persisted.body.metadata?.labels as any)[constants.ARGOPM_LIBRARY_VERSION_LABEL]).toEqual(
                    packageVersion
                );

                const resource = new Resource(persisted.body);
                const msgPrefix = `${object.metadata?.name} ${constants.CONFIGMAP_KIND} already present in the cluster.`;
                expect(consoleDebugSpy).toBeCalledWith(
                    `${msgPrefix} v${resource?.version} is already latest version. Skipping update.`
                );
            }, 2000);
        });

        it("should force-patch secrets successfully", async () => {
            setTimeout(async () => {
                const object = await getResourceFromYaml<V1Secret>("secrets/default.yaml");
                const persisted = await coreK8sApi.readNamespacedSecret(object.metadata?.name || "", NAMESPACE);
                expect(persisted.response.statusCode).toEqual(200);
                expect((persisted.body.metadata?.labels as any)[constants.ARGOPM_LIBRARY_VERSION_LABEL]).toEqual(
                    packageVersion
                );

                const resource = new Resource(persisted.body);
                const msgPrefix = `${object.metadata?.name} ${constants.SECRET_KIND} already present in the cluster.`;
                expect(consoleDebugSpy).toBeCalledWith(
                    `${msgPrefix} v${resource?.version} is already latest version. Skipping update.`
                );
            }, 2000);
        });

        it("should patch workflow templates successfully", async () => {
            setTimeout(async () => {
                const object = await getResourceFromYaml<GenericK8sSpecType>("templates/default.yaml");
                const persisted = (await customK8sApi.getNamespacedCustomObject(
                    constants.ARGO_K8S_API_GROUP,
                    constants.ARGO_K8S_API_VERSION,
                    NAMESPACE,
                    constants.ARGO_WORKFLOW_TEMPLATES_PLURAL,
                    object.metadata?.name || ""
                )) as { response: IncomingMessage; body: GenericK8sSpecType };

                expect(persisted.response.statusCode).toEqual(200);
                expect((persisted.body.metadata?.labels as any)[constants.ARGOPM_LIBRARY_VERSION_LABEL]).toEqual(
                    packageVersion
                );

                const resource = new Resource(persisted.body);
                const msgPrefix = `${object.metadata?.name} ${constants.ARGO_WORKFLOW_TEMPLATES_KIND} already present in the cluster.`;
                expect(consoleDebugSpy).toBeCalledWith(
                    `${msgPrefix} v${resource?.version} is already latest version. Skipping update.`
                );
            }, 2000);
        });

        it("should patch cronworkflows successfully", async () => {
            setTimeout(async () => {
                const object = await getResourceFromYaml<GenericK8sSpecType>("cronworkflows/default.yaml");
                const persisted = (await customK8sApi.getNamespacedCustomObject(
                    constants.ARGO_K8S_API_GROUP,
                    constants.ARGO_K8S_API_VERSION,
                    NAMESPACE,
                    constants.ARGO_WORKFLOWS_PLURAL,
                    object.metadata?.name || ""
                )) as { response: IncomingMessage; body: GenericK8sSpecType };

                expect(persisted.response.statusCode).toEqual(200);
                expect((persisted.body.metadata?.labels as any)[constants.ARGOPM_LIBRARY_VERSION_LABEL]).toEqual(
                    packageVersion
                );

                const resource = new Resource(persisted.body);
                const msgPrefix = `${object.metadata?.name} ${constants.ARGO_CRON_WORKFLOW_KIND} already present in the cluster.`;
                expect(consoleDebugSpy).toBeCalledWith(
                    `${msgPrefix} v${resource?.version} is already latest version. Skipping update.`
                );
            }, 2000);
        });

        it("should patch pipelines successfully", async () => {
            setTimeout(async () => {
                const object = await getResourceFromYaml<GenericK8sSpecType>("pipelines/default.yaml");
                const persisted = (await customK8sApi.getNamespacedCustomObject(
                    constants.ARGO_DATAFLOW_K8S_API_GROUP,
                    constants.ARGO_K8S_API_VERSION,
                    NAMESPACE,
                    constants.ARGO_PIPELINES_PLURAL,
                    object.metadata?.name || ""
                )) as { response: IncomingMessage; body: GenericK8sSpecType };

                expect(persisted.response.statusCode).toEqual(200);
                expect((persisted.body.metadata?.labels as any)[constants.ARGOPM_LIBRARY_VERSION_LABEL]).toEqual(
                    packageVersion
                );

                const resource = new Resource(persisted.body);
                const msgPrefix = `${object.metadata?.name} ${constants.ARGO_DATAFLOW_KIND} already present in the cluster.`;
                expect(consoleDebugSpy).toBeCalledWith(
                    `${msgPrefix} v${resource?.version} is already latest version. Skipping update.`
                );
            }, 2000);
        });
    });

    describe("force update all", () => {
        beforeAll(async () => {
            await yarg.parse(`install . -x -n ${NAMESPACE} --force`);
        });

        it("should force-patch configmaps successfully", async () => {
            // Check existence of fresh-install objects first
            setTimeout(async () => {
                const object = await getResourceFromYaml<V1ConfigMap>("configmaps/default.yaml");
                const persisted = await coreK8sApi.readNamespacedConfigMap(object.metadata?.name || "", NAMESPACE);
                expect(persisted.response.statusCode).toEqual(200);
                expect((persisted.body.metadata?.labels as any)[constants.ARGOPM_LIBRARY_VERSION_LABEL]).toEqual(
                    packageVersion
                );

                const msgPrefix = `${object.metadata?.name} ${constants.CONFIGMAP_KIND} already present in the cluster.`;
                expect(consoleDebugSpy).toBeCalledWith(
                    `${msgPrefix} v0.0.1 will be patch updated to v${packageVersion}`
                );
            }, 2000);
        });

        it("should force-patch secrets successfully", async () => {
            setTimeout(async () => {
                const object = await getResourceFromYaml<V1Secret>("secrets/default.yaml");
                const persisted = await coreK8sApi.readNamespacedSecret(object.metadata?.name || "", NAMESPACE);
                expect(persisted.response.statusCode).toEqual(200);
                expect((persisted.body.metadata?.labels as any)[constants.ARGOPM_LIBRARY_VERSION_LABEL]).toEqual(
                    packageVersion
                );

                const msgPrefix = `${object.metadata?.name} ${constants.SECRET_KIND} already present in the cluster.`;
                expect(consoleDebugSpy).toBeCalledWith(
                    `${msgPrefix} v0.0.1 will be patch updated to v${packageVersion}`
                );
            }, 2000);
        });

        it("should force-patch workflow templates successfully", async () => {
            setTimeout(async () => {
                const object = await getResourceFromYaml<GenericK8sSpecType>("templates/default.yaml");
                const persisted = (await customK8sApi.getNamespacedCustomObject(
                    constants.ARGO_K8S_API_GROUP,
                    constants.ARGO_K8S_API_VERSION,
                    NAMESPACE,
                    constants.ARGO_WORKFLOW_TEMPLATES_PLURAL,
                    object.metadata?.name || ""
                )) as { response: IncomingMessage; body: GenericK8sSpecType };

                expect(persisted.response.statusCode).toEqual(200);
                expect((persisted.body.metadata?.labels as any)[constants.ARGOPM_LIBRARY_VERSION_LABEL]).toEqual(
                    packageVersion
                );

                const msgPrefix = `${object.metadata?.name} ${constants.ARGO_WORKFLOW_TEMPLATES_KIND} already present in the cluster.`;
                expect(consoleDebugSpy).toBeCalledWith(
                    `${msgPrefix} v0.0.1 will be patch updated to v${packageVersion}`
                );
            }, 2000);
        });

        it("should force-patch cronworkflows successfully", async () => {
            setTimeout(async () => {
                const object = await getResourceFromYaml<GenericK8sSpecType>("cronworkflows/default.yaml");
                const persisted = (await customK8sApi.getNamespacedCustomObject(
                    constants.ARGO_K8S_API_GROUP,
                    constants.ARGO_K8S_API_VERSION,
                    NAMESPACE,
                    constants.ARGO_CRON_WORKFLOW_PLURAL,
                    object.metadata?.name || ""
                )) as { response: IncomingMessage; body: GenericK8sSpecType };

                expect(persisted.response.statusCode).toEqual(200);
                expect((persisted.body.metadata?.labels as any)[constants.ARGOPM_LIBRARY_VERSION_LABEL]).toEqual(
                    packageVersion
                );

                const msgPrefix = `${object.metadata?.name} ${constants.ARGO_CRON_WORKFLOW_KIND} already present in the cluster.`;
                expect(consoleDebugSpy).toBeCalledWith(
                    `${msgPrefix} v0.0.1 will be patch updated to v${packageVersion}`
                );
            }, 2000);
        });

        it("should force-patch pipelines successfully", async () => {
            setTimeout(async () => {
                const object = await getResourceFromYaml<GenericK8sSpecType>("pipelines/default.yaml");
                const persisted = (await customK8sApi.getNamespacedCustomObject(
                    constants.ARGO_DATAFLOW_K8S_API_GROUP,
                    constants.ARGO_K8S_API_VERSION,
                    NAMESPACE,
                    constants.ARGO_PIPELINES_PLURAL,
                    object.metadata?.name || ""
                )) as { response: IncomingMessage; body: GenericK8sSpecType };

                expect(persisted.response.statusCode).toEqual(200);
                expect((persisted.body.metadata?.labels as any)[constants.ARGOPM_LIBRARY_VERSION_LABEL]).toEqual(
                    packageVersion
                );

                const msgPrefix = `${object.metadata?.name} ${constants.ARGO_DATAFLOW_KIND} already present in the cluster.`;
                expect(consoleDebugSpy).toBeCalledWith(
                    `${msgPrefix} v0.0.1 will be patch updated to v${packageVersion}`
                );
            }, 2000);
        });
    });

    describe("patch all bump-version", () => {
        beforeAll(async () => {
            shell.sed("-i", /0.0.1/g, NEW_VERSION_BUMP, `${TMP_DIR}/package.json`);
            packageJson = JSON.parse(await readFile(`${TMP_DIR}/package.json`, "utf-8"));
            packageVersion = encode(packageJson.version);
            await yarg.parse(`install . -x -n ${NAMESPACE}`);
        });

        it("should replace configmaps to newer package version successfully", async () => {
            setTimeout(async () => {
                const object = await getResourceFromYaml<V1ConfigMap>("configmaps/default.yaml");
                const persisted = await coreK8sApi.readNamespacedConfigMap(object.metadata?.name || "", NAMESPACE);
                expect(persisted.response.statusCode).toEqual(200);
                expect(persisted.body.metadata).toHaveProperty("labels");
                expect((persisted.body.metadata?.labels as any)[constants.ARGOPM_LIBRARY_VERSION_LABEL]).toEqual(
                    NEW_VERSION_BUMP
                );

                const msgPrefix = `${object.metadata?.name} ${constants.CONFIGMAP_KIND} already present in the cluster.`;
                expect(consoleDebugSpy).toBeCalledWith(
                    `${msgPrefix} v0.0.1 will be patch updated to v${packageVersion}`
                );
            }, 3000);
        });

        it("should replace secrets to newer package version successfully", async () => {
            setTimeout(async () => {
                const object = await getResourceFromYaml<V1Secret>("secrets/default.yaml");
                const persisted = await coreK8sApi.readNamespacedSecret(object.metadata?.name || "", NAMESPACE);
                expect(persisted.response.statusCode).toEqual(200);
                expect(persisted.body.metadata).toHaveProperty("labels");
                expect((persisted.body.metadata?.labels as any)[constants.ARGOPM_LIBRARY_VERSION_LABEL]).toEqual(
                    NEW_VERSION_BUMP
                );

                const msgPrefix = `${object.metadata?.name} ${constants.SECRET_KIND} already present in the cluster.`;
                expect(consoleDebugSpy).toBeCalledWith(
                    `${msgPrefix} v0.0.1 will be patch updated to v${packageVersion}`
                );
            }, 2000);
        });

        it("should replace workflow to newer package version templates successfully", async () => {
            setTimeout(async () => {
                const object = await getResourceFromYaml<GenericK8sSpecType>("templates/default.yaml");
                const persisted = (await customK8sApi.getNamespacedCustomObject(
                    constants.ARGO_K8S_API_GROUP,
                    constants.ARGO_K8S_API_VERSION,
                    NAMESPACE,
                    constants.ARGO_WORKFLOW_TEMPLATES_PLURAL,
                    object.metadata?.name || ""
                )) as { response: IncomingMessage; body: GenericK8sSpecType };

                expect(persisted.response.statusCode).toEqual(200);
                expect(persisted.body.metadata).toHaveProperty("labels");
                expect((persisted.body.metadata?.labels as any)[constants.ARGOPM_LIBRARY_VERSION_LABEL]).toEqual(
                    NEW_VERSION_BUMP
                );

                const msgPrefix = `${object.metadata?.name} ${constants.ARGO_WORKFLOW_TEMPLATES_KIND} already present in the cluster.`;
                expect(consoleDebugSpy).toBeCalledWith(
                    `${msgPrefix} v0.0.1 will be patch updated to v${packageVersion}`
                );
            }, 2000);
        });

        it("should replace cronworkflows to newer package version successfully", async () => {
            setTimeout(async () => {
                const object = await getResourceFromYaml<GenericK8sSpecType>("cronworkflows/default.yaml");
                const persisted = (await customK8sApi.getNamespacedCustomObject(
                    constants.ARGO_K8S_API_GROUP,
                    constants.ARGO_K8S_API_VERSION,
                    NAMESPACE,
                    constants.ARGO_CRON_WORKFLOW_PLURAL,
                    object.metadata?.name || ""
                )) as { response: IncomingMessage; body: GenericK8sSpecType };

                expect(persisted.response.statusCode).toEqual(200);
                expect(persisted.body.metadata).toHaveProperty("labels");
                expect((persisted.body.metadata?.labels as any)[constants.ARGOPM_LIBRARY_VERSION_LABEL]).toEqual(
                    NEW_VERSION_BUMP
                );

                const msgPrefix = `${object.metadata?.name} ${constants.ARGO_CRON_WORKFLOW_KIND} already present in the cluster.`;
                expect(consoleDebugSpy).toBeCalledWith(
                    `${msgPrefix} v0.0.1 will be patch updated to v${packageVersion}`
                );
            }, 2000);
        });

        it("should replace pipelines to newer package version successfully", async () => {
            setTimeout(async () => {
                const object = await getResourceFromYaml<GenericK8sSpecType>("pipelines/default.yaml");
                const persisted = (await customK8sApi.getNamespacedCustomObject(
                    constants.ARGO_DATAFLOW_K8S_API_GROUP,
                    constants.ARGO_K8S_API_VERSION,
                    NAMESPACE,
                    constants.ARGO_PIPELINES_PLURAL,
                    object.metadata?.name || ""
                )) as { response: IncomingMessage; body: GenericK8sSpecType };

                expect(persisted.response.statusCode).toEqual(200);
                expect(persisted.body.metadata).toHaveProperty("labels");
                expect((persisted.body.metadata?.labels as any)[constants.ARGOPM_LIBRARY_VERSION_LABEL]).toEqual(
                    packageVersion
                );

                const resource = new Resource(persisted.body);
                const msgPrefix = `${object.metadata?.name} ${constants.ARGO_DATAFLOW_KIND} already present in the cluster.`;
                expect(consoleDebugSpy).toBeCalledWith(
                    `${msgPrefix} v0.0.1 will be deleted and replaced with v${packageVersion}`
                );
            }, 2000);
        });
    });

    describe("inspect non-K8s resources added upon install", () => {
        const staticDir = `${TMP_DIR}/static`;

        const toUpload = [{
            filePath: `${staticDir}/sample1.txt`,
            content: `# Sample 1 file from ${packageName}`,
        }, {
            filePath: `${staticDir}/folder1/sample1.txt`,
            content: `# Sample 2 file from ${packageName}`,
        }]

        beforeAll(async () => {
            shell.mkdir("-p", `${staticDir}/folder1/`);

            for (let { filePath, content } of toUpload) {
                writeFileSync(filePath, content);
            }
            await yarg.parse(`install .  -x -n ${NAMESPACE}`);
        });

        afterAll(async () => {
            shell.rm("-Rf", staticDir);
        });

        it("should upload files from the static dir", async () => {
            const s3Uploader = new S3(
                constants.ATLAN_DEFAULTS_CONFIGMAP_NAME,
                constants.ATLAN_DEFAULTS_CONFIGMAP_NAMESPACE,
                npa(packageNameFromPath(TMP_DIR))
            );
            await s3Uploader.initialize();

            setTimeout(async () => {
                toUpload.forEach(({ filePath, content }) => {
                    const pathSplit = filePath.split("static/");
                    expect(consoleDebugSpy).toBeCalledWith(`Uploading file: /private/${filePath} to ${s3Uploader.s3KeyPrefix}/${pathSplit[pathSplit.length - 1]}`);
                })

                const response = await Promise.all(
                    toUpload.map(({ filePath, content }) => {
                        const pathSplit = filePath.split("static/");
                        return s3Uploader.client.send(
                            new GetObjectCommand({
                                Bucket: s3Uploader.bucketName,
                                Key: `${s3Uploader.s3KeyPrefix}/${pathSplit[pathSplit.length - 1]}`,
                            })
                        ).then(resp => resp.Body?.toString() === content);
                    })
                )
                expect(response).toBe([true, true]);
            });
        });

        it.skip("should add Grafana dashboards", async () => {

        });
    });

    describe("part-install specific resource only", () => {
        it("should install configmaps only successfully", async () => {
            const newName = "argopm-mock-package-delete-me-configmap-2";
            const newPath = "configmaps/another-custom-configmap.yaml";
            shell.cp("-R", `${MOCK_PACKAGE_DIR}/configmaps/default.yaml`, `${TMP_DIR}/${newPath}`);
            shell.sed("-i", /argopm-mock-package-delete-me-configmap/g, newName, `${TMP_DIR}/${newPath}`);

            await yarg.parse(`install .  -x -n ${NAMESPACE} --cm ${newName}`);

            setTimeout(async () => {
                const object = await getResourceFromYaml<V1ConfigMap>(newPath);
                const persisted = await coreK8sApi.readNamespacedConfigMap(object.metadata?.name || "", NAMESPACE);
                expect(persisted.response.statusCode).toEqual(200);
                expect((persisted.body.metadata?.labels as any)[constants.ARGOPM_LIBRARY_VERSION_LABEL]).toEqual(
                    packageVersion
                );

                expect(consoleDebugSpy).toBeCalledWith(
                    `${object.metadata?.name} ${constants.CONFIGMAP_KIND} not present in the cluster. Installing v${packageVersion}`
                );
            }, 2000);
        });

        it("should install secrets only successfully", async () => {
            const newName = "argopm-mock-package-delete-me-secret-2";
            const newPath = "secrets/another-custom-secret.yaml";
            shell.cp("-R", `${MOCK_PACKAGE_DIR}/secrets/default.yaml`, `${TMP_DIR}/${newPath}`);
            shell.sed("-i", /argopm-mock-package-delete-me-secret/g, newName, `${TMP_DIR}/${newPath}`);

            await yarg.parse(`install .  -x -n ${NAMESPACE} --sec ${newName}`);

            setTimeout(async () => {
                const object = await getResourceFromYaml<V1Secret>(newPath);
                const persisted = await coreK8sApi.readNamespacedSecret(object.metadata?.name || "", NAMESPACE);
                expect(persisted.response.statusCode).toEqual(200);
                expect((persisted.body.metadata?.labels as any)[constants.ARGOPM_LIBRARY_VERSION_LABEL]).toEqual(
                    packageVersion
                );

                expect(consoleDebugSpy).toBeCalledWith(
                    `${object.metadata?.name} ${constants.SECRET_KIND} not present in the cluster. Installing v${packageVersion}`
                );
            }, 2000);
        });

        it("should install templates only successfully", async () => {
            const newName = "argopm-mock-package-delete-me-template-2";
            const newPath = "templates/another-custom-template.yaml";
            shell.cp("-R", `${MOCK_PACKAGE_DIR}/templates/default.yaml`, `${TMP_DIR}/${newPath}`);
            shell.sed("-i", /argopm-mock-package-delete-me-template/g, newName, `${TMP_DIR}/${newPath}`);

            await yarg.parse(`install .  -x -n ${NAMESPACE} --wftmpl ${newName}`);

            setTimeout(async () => {
                const object = await getResourceFromYaml<GenericK8sSpecType>(newPath);
                const persisted = (await customK8sApi.getNamespacedCustomObject(
                    constants.ARGO_WORKFLOW_TEMPLATES_KIND,
                    constants.ARGO_K8S_API_VERSION,
                    NAMESPACE,
                    constants.ARGO_WORKFLOW_TEMPLATES_PLURAL,
                    newName
                )) as { response: IncomingMessage; body: GenericK8sSpecType };
                expect(persisted.response.statusCode).toEqual(200);
                expect((persisted.body.metadata?.labels as any)[constants.ARGOPM_LIBRARY_VERSION_LABEL]).toEqual(
                    packageVersion
                );

                expect(consoleDebugSpy).toBeCalledWith(
                    `${object.metadata?.name} ${constants.ARGO_WORKFLOW_TEMPLATES_KIND} not present in the cluster. Installing v${packageVersion}`
                );
            }, 2000);
        });

        it("should install cronworkflows only successfully", async () => {
            const newName = "argopm-mock-package-delete-me-cronworkflow-2";
            const newPath = "cronworkflows/another-custom-cronworkflow.yaml";
            shell.cp("-R", `${MOCK_PACKAGE_DIR}/cronworkflows/default.yaml`, `${TMP_DIR}/${newPath}`);
            shell.sed("-i", /argopm-mock-package-delete-me-cronworkflow/g, newName, `${TMP_DIR}/${newPath}`);

            await yarg.parse(`install .  -x -n ${NAMESPACE} --cwf ${newName}`);

            setTimeout(async () => {
                const object = await getResourceFromYaml<GenericK8sSpecType>(newPath);
                const persisted = (await customK8sApi.getNamespacedCustomObject(
                    constants.ARGO_CRON_WORKFLOW_KIND,
                    constants.ARGO_K8S_API_VERSION,
                    NAMESPACE,
                    constants.ARGO_CRON_WORKFLOW_PLURAL,
                    newName
                )) as { response: IncomingMessage; body: GenericK8sSpecType };
                expect(persisted.response.statusCode).toEqual(200);
                expect((persisted.body.metadata?.labels as any)[constants.ARGOPM_LIBRARY_VERSION_LABEL]).toEqual(
                    packageVersion
                );

                expect(consoleDebugSpy).toBeCalledWith(
                    `${object.metadata?.name} ${constants.ARGO_CRON_WORKFLOW_KIND} not present in the cluster. Installing v${packageVersion}`
                );
            }, 2000);
        });

        it("should install pipelines only successfully", async () => {
            const newName = "argopm-mock-package-delete-me-pipeline-2";
            const newPath = "pipelines/another-custom-pipeline.yaml";
            shell.cp("-R", `${MOCK_PACKAGE_DIR}/pipelines/default.yaml`, `${TMP_DIR}/${newPath}`);
            shell.sed("-i", /argopm-mock-package-delete-me-pipeline/g, newName, `${TMP_DIR}/${newPath}`);

            await yarg.parse(`install .  -x -n ${NAMESPACE} --ppl ${newName}`);

            setTimeout(async () => {
                const object = await getResourceFromYaml<GenericK8sSpecType>(newPath);
                const persisted = (await customK8sApi.getNamespacedCustomObject(
                    constants.ARGO_DATAFLOW_KIND,
                    constants.ARGO_K8S_API_VERSION,
                    NAMESPACE,
                    constants.ARGO_PIPELINES_PLURAL,
                    newName
                )) as { response: IncomingMessage; body: GenericK8sSpecType };
                expect(persisted.response.statusCode).toEqual(200);
                expect((persisted.body.metadata?.labels as any)[constants.ARGOPM_LIBRARY_VERSION_LABEL]).toEqual(
                    packageVersion
                );

                expect(consoleDebugSpy).toBeCalledWith(
                    `${object.metadata?.name} ${constants.ARGO_DATAFLOW_KIND} not present in the cluster. Installing v${packageVersion}`
                );
            }, 2000);
        });

        it("should install cluster workflow templates only successfully", async () => {
            const newName = "argopm-mock-package-delete-me-cluter-template";
            const newPath = "templates/another-custom-template.yaml";
            shell.cp("-R", `${MOCK_PACKAGE_DIR}/templates/default.yaml`, `${TMP_DIR}/${newPath}`);
            shell.sed("-i", /argopm-mock-package-delete-me-template/g, newName, `${TMP_DIR}/${newPath}`);

            await yarg.parse(`install .  -x -n ${NAMESPACE} --cluster --wftmpl ${newName}`);

            setTimeout(async () => {
                const object = await getResourceFromYaml<V1ConfigMap>(newPath);
                const persisted = (await customK8sApi.getNamespacedCustomObject(
                    constants.ARGO_WORKFLOW_TEMPLATES_KIND,
                    constants.ARGO_K8S_API_VERSION,
                    NAMESPACE,
                    constants.ARGO_WORKFLOW_TEMPLATES_PLURAL,
                    newName
                )) as { response: IncomingMessage; body: GenericK8sSpecType };
                expect(persisted.response.statusCode).toEqual(200);
                expect((persisted.body.metadata?.labels as any)[constants.ARGOPM_LIBRARY_VERSION_LABEL]).toEqual(
                    packageVersion
                );

                expect(consoleDebugSpy).toBeCalledWith(
                    `${object.metadata?.name} ${constants.CONFIGMAP_KIND} not present in the cluster. Installing v${packageVersion}`
                );
            }, 2000);
        });
    });

    describe("run", () => {
        it("should run a workflow from entrypoint successfully", async () => {
            const consoleSpy = jest.spyOn(console, "log");
            await yarg.parse(`run ${packageName.name} --no-color`);

            setTimeout(async () => {
                expect(consoleSpy).toBeCalledWith("Package run successful.");
                consoleSpy.mockRestore();
            }, 2000);
        });

        // it("should not run a workflow from a specific template with missing parameter", async () => {
        //     const runWithMissingParam = () => {
        //         yarg.parse(`run ${packageName.name} whalesay-template --no-color`);
        //     };

        //     expect(runWithMissingParam).toThrowError("Required parameter missing 'message'");
        // });

        it("should run a workflow from a specific template with parameters successfully", async () => {
            const consoleSpy = jest.spyOn(console, "log");
            await yarg.parse(`run ${packageName.name} whalesay-template --no-color -- --message Hey`);

            setTimeout(async () => {
                expect(consoleSpy).toBeCalledWith("Package run successful.");
                consoleSpy.mockRestore();
            }, 2000);
        });
    });

    describe("install/uninstall dependencies", () => {
        const packageToAdd = "giphy";

        beforeAll(async () => {
            await yarg.parse(`install ${packageToAdd} --save -x -n ${NAMESPACE}`);
            await yarg.parse(`install . -x -n ${NAMESPACE}`);
        });

        it(`should install with ${packageToAdd} package as dependency successfully`, async () => {
            setTimeout(async () => {
                const persisted = (await customK8sApi.getNamespacedCustomObject(
                    constants.ARGO_WORKFLOW_TEMPLATES_KIND,
                    constants.ARGO_K8S_API_VERSION,
                    NAMESPACE,
                    constants.ARGO_CRON_WORKFLOW_PLURAL,
                    packageToAdd
                )) as { response: IncomingMessage; body: GenericK8sSpecType };

                expect(persisted.response.statusCode).toEqual(200);
                expect(persisted.body.metadata).toHaveProperty("labels");
                expect((persisted.body.metadata?.labels as any)[constants.ARGOPM_LIBRARY_PARENT_LABEL]).toEqual(
                    packageToAdd
                );
                expect((persisted.body.metadata?.labels as any)[constants.ARGOPM_LIBRARY_PARENT_LABEL]).toEqual(
                    packageName
                );
            }, 2000);
        });

        it(`should show the ${packageToAdd} package in the list successfully`, async () => {
            const consoleSpy = jest.spyOn(console, "log");
            await yarg.parse(`list --no-color ${packageName.name}`);

            setTimeout(async () => {
                const expected = `name  version  parent       registry                  
------------------------------------------------------
smtp  0.1.20   smtp@0.1.20  https://packages.atlan.com`;

                expect(consoleSpy).toBeCalledWith(expected);
            }, 2000);
        });

        it(`should uninstall the ${packageToAdd} package successfully`, async () => {
            const consoleSpy = jest.spyOn(console, "log");
            await yarg.parse(`uninstall --no-color ${packageToAdd}`);

            setTimeout(async () => {
                expect(consoleSpy).toBeCalledWith(`Deleting dependent package ${packageToAdd}`);
                expect(consoleSpy).toBeCalledWith(`Deleting config maps for package ${packageToAdd}`);
                expect(consoleSpy).toBeCalledWith(`Deleting secrets for package ${packageToAdd}`);
                expect(consoleSpy).toBeCalledWith(`Deleting templates for package ${packageToAdd}`);
                expect(consoleSpy).toBeCalledWith(`Deleting cronworkflows for package ${packageToAdd}`);
                expect(consoleSpy).toBeCalledWith(`Deleting pipelines for package ${packageToAdd}`);
                expect(consoleSpy).toBeCalledWith(`Successfully deleted package ${packageToAdd}`);

                const result = await Promise.all([
                    Package.pipelines(NAMESPACE, PackageInfo.getPackageLabel(packageToAdd)),
                    Package.workflowTemplates(NAMESPACE, false, PackageInfo.getPackageLabel(packageToAdd)),
                    Package.cronWorkflows(NAMESPACE, PackageInfo.getPackageLabel(packageToAdd)),
                    Package.configMaps(NAMESPACE, PackageInfo.getPackageLabel(packageToAdd)),
                    Package.secrets(NAMESPACE, PackageInfo.getPackageLabel(packageToAdd)),
                ]);
                const itemsLength = result.reduce((prev, curr) => prev + curr.length, 0);

                expect(itemsLength).toEqual(0);
            }, 2000);
        });
    });

    describe("uninstall", () => {
        it(`should uninstall successfully`, async () => {
            const consoleSpy = jest.spyOn(console, "log");
            await yarg.parse(`uninstall --no-color ${packageName.name}`);

            setTimeout(async () => {
                expect(consoleSpy).toBeCalledWith(`Deleting config maps for package ${packageName.name}`);
                expect(consoleSpy).toBeCalledWith(`Deleting secrets for package ${packageName.name}`);
                expect(consoleSpy).toBeCalledWith(`Deleting templates for package ${packageName.name}`);
                expect(consoleSpy).toBeCalledWith(`Deleting cronworkflows for package ${packageName.name}`);
                expect(consoleSpy).toBeCalledWith(`Deleting pipelines for package ${packageName.name}`);
                expect(consoleSpy).toBeCalledWith(`Successfully deleted package ${packageName.name}`);

                const result = await Promise.all([
                    Package.pipelines(NAMESPACE, PackageInfo.getPackageLabel(packageName.name)),
                    Package.workflowTemplates(NAMESPACE, false, PackageInfo.getPackageLabel(packageName.name)),
                    Package.cronWorkflows(NAMESPACE, PackageInfo.getPackageLabel(packageName.name)),
                    Package.configMaps(NAMESPACE, PackageInfo.getPackageLabel(packageName.name)),
                    Package.secrets(NAMESPACE, PackageInfo.getPackageLabel(packageName.name)),
                ]);
                const itemsLength = result.reduce((prev, curr) => prev + curr.length, 0);

                expect(itemsLength).toEqual(0);
            }, 2000);
        });
    });
});
