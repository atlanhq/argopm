import { afterAll, beforeAll, describe, expect, it, jest } from "@jest/globals";
import { CoreV1Api, CustomObjectsApi, KubeConfig, V1ConfigMap, V1Secret } from "@kubernetes/client-node";
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
import { encode } from "../lib/models/info.mjs";
import { Resource } from "../lib/models/resource.mjs";
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
    it.skip("should run init successfully", async () => {
        shell.rm("-Rf", TMP_DIR);
        shell.mkdir(TMP_DIR);
        shell.cd(TMP_DIR);

        const consoleSpy = jest.spyOn(console, "log");

        await yarg.parse("init .");
        expect(shell.test("-e", "package.json")).toBe(true);

        const outputDirLs = shell.ls(`${TMP_DIR}/`);
        const inputDirLs = shell.ls(`${CURRENT_DIR.stdout}/lib/static/package/`);
        const packageName = npa(packageNameFromPath(TMP_DIR));
        expect(consoleSpy).toBeCalledWith(
            `Installing from the current directory (/private${TMP_DIR}) with the package name "${packageName.name}"...`
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
            await uninstall(NAMESPACE, packageName.name, false);
        } catch { }
    });

    describe("fresh-install all", () => {
        beforeAll(async () => {
            await yarg.parse(`install . -x -n ${NAMESPACE}`);
            packageJson = JSON.parse(await readFile(`${TMP_DIR}/package.json`, "utf-8"));
            packageVersion = encode(packageJson.version);
        });

        it("should show installing message", () => {
            expect(consoleLogSpy).toBeCalledWith(`Installing package ${packageName}`);
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
                    `${constants.ARGO_WORKFLOW_TEMPLATES_KIND.toLowerCase()}s`,
                    object.metadata?.name || "",
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
                    `${constants.ARGO_CRON_WORKFLOW_KIND.toLowerCase()}s`,
                    object.metadata?.name || "",
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
                    `${constants.ARGO_DATAFLOW_KIND.toLowerCase()}s`,
                    object.metadata?.name || "",
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

        it("should patch configmaps successfully", async () => {
            // Check existence of fresh-install objects first
            setTimeout(async () => {
                const object = await getResourceFromYaml<V1ConfigMap>("configmaps/default.yaml");
                const persisted = await coreK8sApi.readNamespacedConfigMap(object.metadata?.name || "", NAMESPACE);
                expect(persisted.response.statusCode).toEqual(200);
                expect((persisted.body.metadata?.labels as any)[constants.ARGOPM_LIBRARY_VERSION_LABEL]).toEqual(packageVersion);

                const resource = new Resource(persisted.body);
                const msgPrefix = `${object.metadata?.name} ${constants.CONFIGMAP_KIND} already present in the cluster.`;
                expect(consoleDebugSpy).toBeCalledWith(
                    `${msgPrefix} v${resource?.version} is already latest version. Skipping update.`
                );
            }, 2000)
        });

        it("should patch secrets successfully", async () => {
            setTimeout(async () => {
                const object = await getResourceFromYaml<V1Secret>("secrets/default.yaml");
                const persisted = await coreK8sApi.readNamespacedSecret(object.metadata?.name || "", NAMESPACE);
                expect(persisted.response.statusCode).toEqual(200);
                expect((persisted.body.metadata?.labels as any)[constants.ARGOPM_LIBRARY_VERSION_LABEL]).toEqual(packageVersion);

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
                const persisted = await customK8sApi.getNamespacedCustomObject(
                    constants.ARGO_K8S_API_GROUP,
                    constants.ARGO_K8S_API_VERSION,
                    NAMESPACE,
                    `${constants.ARGO_WORKFLOW_TEMPLATES_KIND.toLowerCase()}s`,
                    object.metadata?.name || "",
                ) as { response: IncomingMessage, body: GenericK8sSpecType };

                expect(persisted.response.statusCode).toEqual(200);
                expect((persisted.body.metadata?.labels as any)[constants.ARGOPM_LIBRARY_VERSION_LABEL]).toEqual(packageVersion);

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
                const persisted = await customK8sApi.getNamespacedCustomObject(
                    constants.ARGO_K8S_API_GROUP,
                    constants.ARGO_K8S_API_VERSION,
                    NAMESPACE,
                    `${constants.ARGO_CRON_WORKFLOW_KIND.toLowerCase()}s`,
                    object.metadata?.name || "",
                ) as { response: IncomingMessage, body: GenericK8sSpecType };

                expect(persisted.response.statusCode).toEqual(200);
                expect((persisted.body.metadata?.labels as any)[constants.ARGOPM_LIBRARY_VERSION_LABEL]).toEqual(packageVersion);

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
                const persisted = await customK8sApi.getNamespacedCustomObject(
                    constants.ARGO_DATAFLOW_K8S_API_GROUP,
                    constants.ARGO_K8S_API_VERSION,
                    NAMESPACE,
                    `${constants.ARGO_DATAFLOW_KIND.toLowerCase()}s`,
                    object.metadata?.name || "",
                ) as { response: IncomingMessage, body: GenericK8sSpecType };

                expect(persisted.response.statusCode).toEqual(200);
                expect((persisted.body.metadata?.labels as any)[constants.ARGOPM_LIBRARY_VERSION_LABEL]).toEqual(packageVersion);

                const resource = new Resource(persisted.body);
                const msgPrefix = `${object.metadata?.name} ${constants.ARGO_DATAFLOW_KIND} already present in the cluster.`;
                expect(consoleDebugSpy).toBeCalledWith(
                    `${msgPrefix} v${resource?.version} is already latest version. Skipping update.`
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
                expect((persisted.body.metadata?.labels as any)[constants.ARGOPM_LIBRARY_VERSION_LABEL]).toEqual(NEW_VERSION_BUMP);

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
                expect((persisted.body.metadata?.labels as any)[constants.ARGOPM_LIBRARY_VERSION_LABEL]).toEqual(NEW_VERSION_BUMP);

                const msgPrefix = `${object.metadata?.name} ${constants.SECRET_KIND} already present in the cluster.`;
                expect(consoleDebugSpy).toBeCalledWith(
                    `${msgPrefix} v0.0.1 will be patch updated to v${packageVersion}`
                );
            }, 2000);
        });

        it("should replace workflow to newer package version templates successfully", async () => {
            setTimeout(async () => {
                const object = await getResourceFromYaml<GenericK8sSpecType>("templates/default.yaml");
                const persisted = await customK8sApi.getNamespacedCustomObject(
                    constants.ARGO_K8S_API_GROUP,
                    constants.ARGO_K8S_API_VERSION,
                    NAMESPACE,
                    `${constants.ARGO_WORKFLOW_TEMPLATES_KIND.toLowerCase()}s`,
                    object.metadata?.name || "",
                ) as { response: IncomingMessage, body: GenericK8sSpecType };

                expect(persisted.response.statusCode).toEqual(200);
                expect(persisted.body.metadata).toHaveProperty("labels");
                expect((persisted.body.metadata?.labels as any)[constants.ARGOPM_LIBRARY_VERSION_LABEL]).toEqual(NEW_VERSION_BUMP);

                const msgPrefix = `${object.metadata?.name} ${constants.ARGO_WORKFLOW_TEMPLATES_KIND} already present in the cluster.`;
                expect(consoleDebugSpy).toBeCalledWith(
                    `${msgPrefix} v0.0.1 will be patch updated to v${packageVersion}`
                );
            }, 2000);
        });

        it("should replace cronworkflows to newer package version successfully", async () => {
            setTimeout(async () => {
                const object = await getResourceFromYaml<GenericK8sSpecType>("cronworkflows/default.yaml");
                const persisted = await customK8sApi.getNamespacedCustomObject(
                    constants.ARGO_K8S_API_GROUP,
                    constants.ARGO_K8S_API_VERSION,
                    NAMESPACE,
                    `${constants.ARGO_CRON_WORKFLOW_KIND.toLowerCase()}s`,
                    object.metadata?.name || "",
                ) as { response: IncomingMessage, body: GenericK8sSpecType };

                expect(persisted.response.statusCode).toEqual(200);
                expect(persisted.body.metadata).toHaveProperty("labels");
                expect((persisted.body.metadata?.labels as any)[constants.ARGOPM_LIBRARY_VERSION_LABEL]).toEqual(NEW_VERSION_BUMP);

                const msgPrefix = `${object.metadata?.name} ${constants.ARGO_CRON_WORKFLOW_KIND} already present in the cluster.`;
                expect(consoleDebugSpy).toBeCalledWith(
                    `${msgPrefix} v0.0.1 will be patch updated to v${packageVersion}`
                );
            }, 2000);
        });

        it("should replace pipelines to newer package version successfully", async () => {
            setTimeout(async () => {
                const object = await getResourceFromYaml<GenericK8sSpecType>("pipelines/default.yaml");
                const persisted = await customK8sApi.getNamespacedCustomObject(
                    constants.ARGO_DATAFLOW_K8S_API_GROUP,
                    constants.ARGO_K8S_API_VERSION,
                    NAMESPACE,
                    `${constants.ARGO_DATAFLOW_KIND.toLowerCase()}s`,
                    object.metadata?.name || "",
                ) as { response: IncomingMessage, body: GenericK8sSpecType };

                expect(persisted.response.statusCode).toEqual(200);
                expect(persisted.body.metadata).toHaveProperty("labels");
                expect((persisted.body.metadata?.labels as any)[constants.ARGOPM_LIBRARY_VERSION_LABEL]).toEqual(packageVersion);

                const resource = new Resource(persisted.body);
                const msgPrefix = `${object.metadata?.name} ${constants.ARGO_DATAFLOW_KIND} already present in the cluster.`;
                expect(consoleDebugSpy).toBeCalledWith(
                    `${msgPrefix} v0.0.1 will be deleted and replaced with v${packageVersion}`
                );
            }, 2000);
        });
    });

    describe("run", () => {
        it("should run a worflow successfully", async () => {
            setTimeout(async () => {
                const consoleSpy = jest.spyOn(console, "log");

                await yarg.parse(`run --no-color ${packageName.name}`);

                expect(consoleSpy).toBeCalledWith("Package run successful.");
                consoleSpy.mockRestore();
            }, 2000);
        });
    })

    describe("install/uninstall dependencies", () => {
        const packageToAdd = "giphy";

        beforeAll(async () => {
            await yarg.parse(`install ${packageToAdd} --save -x -n ${NAMESPACE}`);
            await yarg.parse(`install . -x -n ${NAMESPACE}`);
        });

        it(`should install with ${packageToAdd} package as dependency successfully`, async () => {
            setTimeout(async () => {
                const persisted = await customK8sApi.getNamespacedCustomObject(
                    constants.ARGO_WORKFLOW_TEMPLATES_KIND,
                    constants.ARGO_K8S_API_VERSION,
                    NAMESPACE,
                    `${constants.ARGO_CRON_WORKFLOW_KIND.toLowerCase()}s`,
                    packageToAdd,
                ) as { response: IncomingMessage, body: GenericK8sSpecType };

                expect(persisted.response.statusCode).toEqual(200);
                expect(persisted.body.metadata).toHaveProperty("labels");
                expect((persisted.body.metadata?.labels as any)[constants.ARGOPM_LIBRARY_PARENT_LABEL]).toEqual(packageToAdd);
                expect((persisted.body.metadata?.labels as any)[constants.ARGOPM_LIBRARY_PARENT_LABEL]).toEqual(packageName);
            }, 2000);
        });

        it(`should show the ${packageToAdd} package in the list successfully`, async () => {
            setTimeout(async () => {
                const consoleSpy = jest.spyOn(console, "log");
                await yarg.parse(`list --no-color ${packageName.name}`);
                const expected = `name  version  parent       registry                  
------------------------------------------------------
smtp  0.1.20   smtp@0.1.20  https://packages.atlan.com`;

                expect(consoleSpy).toBeCalledWith(expected);
            }, 2000);
        });

        it(`should uninstall the ${packageToAdd} package successfully`, async () => {
            setTimeout(async () => {
                const consoleSpy = jest.spyOn(console, "log");
                await yarg.parse(`uninstall --no-color ${packageToAdd}`);

                expect(consoleSpy).toBeCalledWith(`Deleting dependent package ${packageToAdd}`);
                expect(consoleSpy).toBeCalledWith(`Deleting config maps for package ${packageToAdd}`);
                expect(consoleSpy).toBeCalledWith(`Deleting secrets for package ${packageToAdd}`);
                expect(consoleSpy).toBeCalledWith(`Deleting templates for package ${packageToAdd}`);
                expect(consoleSpy).toBeCalledWith(`Deleting cronworkflows for package ${packageToAdd}`);
                expect(consoleSpy).toBeCalledWith(`Deleting pipelines for package ${packageToAdd}`);
                expect(consoleSpy).toBeCalledWith(`Successfully deleted package ${packageToAdd}`);

                // const persisted = await customK8sApi.getNamespacedCustomObject(
                //     constants.ARGO_WORKFLOW_TEMPLATES_KIND,
                //     constants.ARGO_K8S_API_VERSION,
                //     NAMESPACE,
                //     `${constants.ARGO_CRON_WORKFLOW_KIND.toLowerCase()}s`,
                //     packageToAdd,
                // ) as { response: IncomingMessage, body: GenericK8sSpecType };

                // expect(persisted.response.statusCode).toEqual(404);
            }, 2000);
        });
    });

    describe("uninstall", () => {
        it(`should uninstall successfully`, async () => {
            setTimeout(async () => {
                const consoleSpy = jest.spyOn(console, "log");
                await yarg.parse(`uninstall --no-color ${packageName.name}`);

                expect(consoleSpy).toBeCalledWith(`Deleting config maps for package ${packageName.name}`);
                expect(consoleSpy).toBeCalledWith(`Deleting secrets for package ${packageName.name}`);
                expect(consoleSpy).toBeCalledWith(`Deleting templates for package ${packageName.name}`);
                expect(consoleSpy).toBeCalledWith(`Deleting cronworkflows for package ${packageName.name}`);
                expect(consoleSpy).toBeCalledWith(`Deleting pipelines for package ${packageName.name}`);
                expect(consoleSpy).toBeCalledWith(`Successfully deleted package ${packageName.name}`);

                // const persisted = await customK8sApi.getNamespacedCustomObject(
                //     constants.ARGO_WORKFLOW_TEMPLATES_KIND,
                //     constants.ARGO_K8S_API_VERSION,
                //     NAMESPACE,
                //     `${constants.ARGO_CRON_WORKFLOW_KIND.toLowerCase()}s`,
                //     packageName.name,
                // ) as { response: IncomingMessage, body: GenericK8sSpecType };

                // expect(persisted.response.statusCode).toEqual(404);
            }, 2000);
        });
    });
});
