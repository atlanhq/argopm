const yaml = require("js-yaml");
const fs = require("fs");
const rewire = require("rewire");

const k8s = rewire("../lib/k8s.js");

// No tenant overrides unless a test sets them.
k8s.__get__("coreK8sApi").readNamespacedConfigMap = () =>
    Promise.reject(Object.assign(new Error("not found"), { code: 404 }));
beforeEach(() => k8s.__get__("cronOverridesByNamespace").clear());
const enableClusterScope = k8s.__get__("enableClusterScope");
const copyLabelsToPodMetaData = k8s.__get__("copyPackageInfoToPodMetaData");

describe("verify enableClusterScope", () => {
    test("assert cluster scope enabled in dag", () => {
        const yamlObject = yaml.load(
            fs.readFileSync(__dirname + "/fixtures/mock-package/templates/default-dag.yaml", "utf8")
        );
        expect(
            yamlObject["spec"]["templates"][0]["dag"]["tasks"][0]["templateRef"]["clusterScope"] == undefined
        ).toBeTruthy();
        enableClusterScope(yamlObject);
        expect(yamlObject["spec"]["templates"][0]["dag"]["tasks"][0]["templateRef"]["clusterScope"]).toBeTruthy();
    });
    test("assert cluster scope enabled in step", () => {
        const yamlObject = yaml.load(
            fs.readFileSync(__dirname + "/fixtures/mock-package/templates/default-step.yaml", "utf8")
        );
        let steps = yamlObject["spec"]["templates"][0]["steps"];
        steps.forEach((sub_steps) => {
            sub_steps.forEach((sub_step) => {
                expect(sub_step["templateRef"]["clusterScope"] == undefined).toBeTruthy();
            });
        });

        enableClusterScope(yamlObject);
        steps = yamlObject["spec"]["templates"][0]["steps"];
        steps.forEach((sub_steps) => {
            sub_steps.forEach((sub_step) => {
                expect(sub_step["templateRef"]["clusterScope"]).toBeTruthy();
            });
        });
    });
});

describe("copyPackageInfoToPodMetaData", () => {
    test("should add labels to yamlObject", () => {
        const kind = "WorkflowTemplate";
        const yamlObject = yaml.load(
            fs.readFileSync(__dirname + "/fixtures/mock-package/cronworkflows/default.yaml", "utf8")
        );
        // Call the function
        const result = copyLabelsToPodMetaData(yamlObject, kind);

        // Assertions
        expect(result.metadata.labels).toEqual({
            "package.argoproj.io/version": "0.34.217",
        });
        expect(result.metadata.annotations).toEqual({
            "package.argoproj.io/name": "whalesay",
        });
        expect(result.spec.podMetadata.annotations).toEqual({
            "package.argoproj.io/version": "0.34.217",
            "package.argoproj.io/name": "whalesay",
        });
    });

    test("should not add podMetadata for non-Argo workflows", () => {
        // Mock input data
        const yamlObject = {
            metadata: {
                name: "test",
            },
            spec: {},
        };
        const kind = "SomeOtherKind";

        // Call the function
        const result = copyLabelsToPodMetaData(yamlObject, kind);

        // Assertions
        expect(result.spec.podMetadata).toBeUndefined();
    });
});

describe("keepArgoOffHold", () => {
    const keepArgoOffHold = k8s.__get__("keepArgoOffHold");
    const Resource = require("../lib/models/resource");
    const HOLD = "atlan.com/suspended-by-argo-off";

    const live = (annotations, suspend) =>
        new Resource({
            kind: "CronWorkflow",
            metadata: { name: "nightly", labels: { "package.argoproj.io/version": "1.0.0" }, annotations },
            spec: { schedule: "0 0 * * *", suspend },
        });
    const pkg = () => ({
        kind: "CronWorkflow",
        metadata: { name: "nightly", labels: { "package.argoproj.io/version": "1.0.1" } },
        spec: { schedule: "0 1 * * *", suspend: false },
    });

    test("keeps a held cron suspended", () => {
        const obj = pkg();
        expect(keepArgoOffHold(live({ [HOLD]: "true" }, true), obj)).toBe(true);
        expect(obj.spec.suspend).toBe(true);
        expect(obj.spec.schedule).toBe("0 1 * * *");
    });

    test("leaves an unmarked cron as the package has it", () => {
        const obj = pkg();
        expect(keepArgoOffHold(live({}, true), obj)).toBe(false);
        expect(obj.spec.suspend).toBe(false);
    });

    test("leaves a marked cron that is running as the package has it", () => {
        const obj = pkg();
        expect(keepArgoOffHold(live({ [HOLD]: "true" }, false), obj)).toBe(false);
        expect(obj.spec.suspend).toBe(false);
    });

    test("ignores other kinds", () => {
        const obj = { ...pkg(), kind: "WorkflowTemplate" };
        expect(keepArgoOffHold(live({ [HOLD]: "true" }, true), obj)).toBe(false);
    });

    test("a forced package update keeps the hold in the patch it sends", async () => {
        const K8sInstaller = k8s.__get__("K8sInstaller");
        const sent = [];
        const restore = k8s.__set__("K8sInstaller.patchCustomResource", (name, ns, plural, body) => {
            sent.push(body);
            return Promise.resolve(body);
        });
        try {
            const items = [
                {
                    kind: "CronWorkflow",
                    metadata: {
                        name: "nightly",
                        labels: { "package.argoproj.io/version": "1.0.1" },
                        annotations: { [HOLD]: "true" },
                    },
                    spec: { schedule: "0 0 * * *", suspend: true },
                },
            ];
            await K8sInstaller.handleUpsertWithTemplateResponse(
                { items },
                "default",
                "cronworkflows",
                pkg(),
                false,
                "argoproj.io",
                true
            );
            expect(sent).toHaveLength(1);
            expect(sent[0].spec.suspend).toBe(true);
            expect(sent[0].spec.schedule).toBe("0 1 * * *");
        } finally {
            restore();
        }
    });
});

describe("clearStaleArgoOffMark", () => {
    const clearStaleArgoOffMark = k8s.__get__("clearStaleArgoOffMark");
    const Resource = require("../lib/models/resource");
    const HOLD = "atlan.com/suspended-by-argo-off";

    const live = (annotations, suspend) =>
        new Resource({
            kind: "CronWorkflow",
            metadata: { name: "nightly", labels: { "package.argoproj.io/version": "1.0.0" }, annotations },
            spec: { schedule: "0 0 * * *", suspend },
        });
    const pkg = (suspend = false) => ({
        kind: "CronWorkflow",
        metadata: { name: "nightly", labels: { "package.argoproj.io/version": "1.0.1" } },
        spec: { schedule: "0 1 * * *", suspend },
    });

    test("removes the mark from a cron that was resumed", () => {
        const obj = pkg();
        expect(clearStaleArgoOffMark(live({ [HOLD]: "true" }, false), obj)).toBe(true);
        expect(obj.metadata.annotations[HOLD]).toBeNull();
    });

    test("treats a cron with no suspend field as resumed", () => {
        const obj = pkg();
        expect(clearStaleArgoOffMark(live({ [HOLD]: "true" }, undefined), obj)).toBe(true);
    });

    test("keeps the mark on a cron that is still held", () => {
        const obj = pkg();
        expect(clearStaleArgoOffMark(live({ [HOLD]: "true" }, true), obj)).toBe(false);
        expect(obj.metadata.annotations).toBeUndefined();
    });

    test("leaves an unmarked cron alone", () => {
        const obj = pkg();
        expect(clearStaleArgoOffMark(live({}, false), obj)).toBe(false);
        expect(obj.metadata.annotations).toBeUndefined();
    });

    test("ignores other kinds", () => {
        const obj = { ...pkg(), kind: "WorkflowTemplate" };
        expect(clearStaleArgoOffMark(live({ [HOLD]: "true" }, false), obj)).toBe(false);
    });

    const upsert = async (liveCron, pkgObj) => {
        const K8sInstaller = k8s.__get__("K8sInstaller");
        const sent = [];
        const restore = k8s.__set__("K8sInstaller.patchCustomResource", (name, ns, plural, body) => {
            sent.push(body);
            return Promise.resolve(body);
        });
        try {
            await K8sInstaller.handleUpsertWithTemplateResponse(
                { items: [liveCron] },
                "default",
                "cronworkflows",
                pkgObj,
                false,
                "argoproj.io",
                true
            );
        } finally {
            restore();
        }
        return sent;
    };
    const liveCron = (suspend) => ({
        kind: "CronWorkflow",
        metadata: {
            name: "nightly",
            labels: { "package.argoproj.io/version": "1.0.1" },
            annotations: { [HOLD]: "true" },
        },
        spec: { schedule: "0 0 * * *", suspend },
    });

    test("a forced update of a resumed cron sends the package's suspend and deletes the mark", async () => {
        const sent = await upsert(liveCron(false), pkg(false));
        expect(sent).toHaveLength(1);
        expect(sent[0].spec.suspend).toBe(false);
        expect(sent[0].metadata.annotations[HOLD]).toBeNull();
    });

    test("a forced update of a held cron keeps both the hold and the mark", async () => {
        const sent = await upsert(liveCron(true), pkg(false));
        expect(sent).toHaveLength(1);
        expect(sent[0].spec.suspend).toBe(true);
        expect((sent[0].metadata.annotations || {})[HOLD]).not.toBeNull();
    });
});

describe("tenant CronWorkflow overrides", () => {
    const HOLD = "atlan.com/suspended-by-argo-off";
    const parseCronOverrides = k8s.__get__("parseCronOverrides");
    const cronOverrides = k8s.__get__("cronOverrides");

    const withConfigMap = (read) => {
        const calls = [];
        const api = k8s.__get__("coreK8sApi");
        const original = api.readNamespacedConfigMap;
        api.readNamespacedConfigMap = (args) => {
            calls.push(args);
            return read(args);
        };
        k8s.__get__("cronOverridesByNamespace").clear();
        return {
            calls,
            restore: () => {
                api.readNamespacedConfigMap = original;
                k8s.__get__("cronOverridesByNamespace").clear();
            },
        };
    };
    const pkg = (suspend = false) => ({
        kind: "CronWorkflow",
        metadata: { name: "nightly", labels: { "package.argoproj.io/version": "1.0.1" } },
        spec: { schedule: "0 1 * * *", suspend },
    });
    const liveCron = (suspend, annotations = {}) => ({
        kind: "CronWorkflow",
        metadata: { name: "nightly", labels: { "package.argoproj.io/version": "1.0.1" }, annotations },
        spec: { schedule: "0 0 * * *", suspend },
    });
    const upsert = async (items, pkgObj) => {
        const K8sInstaller = k8s.__get__("K8sInstaller");
        const sent = [];
        const restorePatch = k8s.__set__("K8sInstaller.patchCustomResource", (name, ns, plural, body) => {
            sent.push({ op: "patch", body });
            return Promise.resolve(body);
        });
        const restoreCreate = k8s.__set__("K8sInstaller.createCustomResource", (ns, plural, body) => {
            sent.push({ op: "create", body });
            return Promise.resolve(body);
        });
        try {
            await K8sInstaller.handleUpsertWithTemplateResponse(
                { items },
                "default",
                "cronworkflows",
                pkgObj,
                false,
                "argoproj.io",
                true
            );
        } finally {
            restorePatch();
            restoreCreate();
        }
        return sent;
    };

    test("parses hold and run, and drops anything else", () => {
        expect(parseCronOverrides({ a: "hold", b: "run", c: "true", d: "", e: "constructor" })).toEqual({
            a: true,
            b: false,
        });
    });

    test("reads the ConfigMap once per namespace", async () => {
        const cm = withConfigMap(() => Promise.resolve({ data: { nightly: "hold" } }));
        try {
            expect(await cronOverrides("default")).toEqual({ nightly: true });
            expect(await cronOverrides("default")).toEqual({ nightly: true });
            expect(cm.calls).toEqual([{ name: "atlan-cron-overrides", namespace: "default" }]);
        } finally {
            cm.restore();
        }
    });

    test("a missing ConfigMap means no overrides", async () => {
        const cm = withConfigMap(() => Promise.reject(Object.assign(new Error("not found"), { code: 404 })));
        try {
            expect(await cronOverrides("default")).toEqual({});
        } finally {
            cm.restore();
        }
    });

    test("a failed read is reported as unknown, not as no overrides", async () => {
        const cm = withConfigMap(() => Promise.reject(Object.assign(new Error("forbidden"), { code: 403 })));
        try {
            expect(await cronOverrides("default")).toBeNull();
        } finally {
            cm.restore();
        }
    });

    test("a failed read leaves crons untouched for the run", async () => {
        const cm = withConfigMap(() => Promise.reject(Object.assign(new Error("timeout"), { code: 504 })));
        try {
            expect(await upsert([liveCron(true)], pkg(false))).toHaveLength(0);
            expect(await upsert([], pkg(false))).toHaveLength(0);
        } finally {
            cm.restore();
        }
    });

    test("an empty ConfigMap means no overrides", async () => {
        const cm = withConfigMap(() => Promise.resolve({}));
        try {
            expect(await cronOverrides("default")).toEqual({});
        } finally {
            cm.restore();
        }
    });

    test("hold suspends a running cron the package turns on", async () => {
        const cm = withConfigMap(() => Promise.resolve({ data: { nightly: "hold" } }));
        try {
            const sent = await upsert([liveCron(false)], pkg(false));
            expect(sent).toHaveLength(1);
            expect(sent[0].op).toBe("patch");
            expect(sent[0].body.spec.suspend).toBe(true);
            expect(sent[0].body.spec.schedule).toBe("0 1 * * *");
        } finally {
            cm.restore();
        }
    });

    test("run releases an Argo-off hold", async () => {
        const cm = withConfigMap(() => Promise.resolve({ data: { nightly: "run" } }));
        try {
            const sent = await upsert([liveCron(true, { [HOLD]: "true" })], pkg(false));
            expect(sent[0].body.spec.suspend).toBe(false);
        } finally {
            cm.restore();
        }
    });

    test("hold on a held cron keeps the mark, so removing the override keeps the Argo-off hold", async () => {
        const cm = withConfigMap(() => Promise.resolve({ data: { nightly: "hold" } }));
        try {
            const sent = await upsert([liveCron(true, { [HOLD]: "true" })], pkg(false));
            expect(sent[0].body.spec.suspend).toBe(true);
            expect((sent[0].body.metadata.annotations || {})[HOLD]).not.toBeNull();
        } finally {
            cm.restore();
        }
        const after = withConfigMap(() => Promise.resolve({ data: {} }));
        try {
            const sent = await upsert([liveCron(true, { [HOLD]: "true" })], pkg(false));
            expect(sent[0].body.spec.suspend).toBe(true);
        } finally {
            after.restore();
        }
    });

    test("run turns on a cron the package suspends", async () => {
        const cm = withConfigMap(() => Promise.resolve({ data: { nightly: "run" } }));
        try {
            const sent = await upsert([liveCron(true)], pkg(true));
            expect(sent[0].body.spec.suspend).toBe(false);
        } finally {
            cm.restore();
        }
    });

    test("a new cron is created with its override", async () => {
        const cm = withConfigMap(() => Promise.resolve({ data: { nightly: "hold" } }));
        try {
            const sent = await upsert([], pkg(false));
            expect(sent).toEqual([expect.objectContaining({ op: "create" })]);
            expect(sent[0].body.spec.suspend).toBe(true);
            expect(sent[0].body.metadata.annotations).toBeUndefined();
        } finally {
            cm.restore();
        }
    });

    test("a cron with no entry keeps the package value and the Argo-off hold", async () => {
        const cm = withConfigMap(() => Promise.resolve({ data: { other: "run" } }));
        try {
            const sent = await upsert([liveCron(true, { [HOLD]: "true" })], pkg(false));
            expect(sent[0].body.spec.suspend).toBe(true);
            expect((sent[0].body.metadata.annotations || {})[HOLD]).not.toBeNull();
        } finally {
            cm.restore();
        }
    });

    test("other kinds never read the ConfigMap", async () => {
        const cm = withConfigMap(() => Promise.resolve({ data: { nightly: "hold" } }));
        try {
            const obj = { ...pkg(), kind: "WorkflowTemplate" };
            const sent = await upsert([], obj);
            expect(cm.calls).toHaveLength(0);
            expect(sent[0].body.spec.suspend).toBe(false);
        } finally {
            cm.restore();
        }
    });
});
