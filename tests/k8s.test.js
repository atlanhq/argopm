const yaml = require("js-yaml");
const fs = require("fs");
const rewire = require("rewire");

const k8s = rewire("../lib/k8s.js");
const enableClusterScope = k8s.__get__("enableClusterScope");

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
