const yaml = require("js-yaml");
const fs = require("fs");
const rewire = require("rewire");

const k8s = rewire("../lib/k8s.js");
const enableClusterScope = k8s.__get__("enableClusterScope");
const copyLabelsToPodMetaData = k8s.__get__("copyLabelsToPodMetaData");

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

describe("copyLabelsToPodMetaData", () => {
    test("should add labels to yamlObject", () => {
        const kind = "WorkflowTemplate";
        const yamlObject = yaml.load(
            fs.readFileSync(__dirname + "/fixtures/mock-package/cronworkflows/default.yaml", "utf8")
        );
        // Call the function
        const result = copyLabelsToPodMetaData(yamlObject, kind);

        // Assertions
        expect(result.metadata.labels).toEqual({
            package: "whalesay",
        });
        expect(result.spec.podMetadata.labels).toEqual({
            package: "whalesay",
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
