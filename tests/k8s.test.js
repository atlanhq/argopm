const yaml = require("js-yaml");
const fs = require("fs");
const rewire = require("rewire");

const k8s = rewire("../lib/k8s.js");
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
