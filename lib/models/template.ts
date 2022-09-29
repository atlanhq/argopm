import { Input } from "./input";
import { readFile } from "node:fs/promises";
import { load } from "js-yaml";
import { blue, bright } from "ansicolor";
import { GenericK8sSpecType } from "../k8s";

export class Template {
    name: string;
    inputs: any;

    /**
     * @param {Object} templateObj
     */
    constructor(templateObj: { name: any; inputs: any }) {
        this.name = templateObj.name;
        this.inputs = new Input(templateObj.inputs);
    }

    info() {
        let templateHelp = blue(`Template: ${bright(this.name)}\n`);
        templateHelp += `${this.inputs.info()}`;
        return templateHelp;
    }

    /**
     * Run the template
     * @param {string} packageName
     * @param {Object} args
     * @param {string} serviceAccountName
     * @param {string} imagePullSecrets
     * @param {Boolean} cluster
     * @returns {PromiseLike<{Object}>}
     */
    async generateWorkflow(packageName: any, args: any, serviceAccountName: any, imagePullSecrets: any, cluster: any) {
        const runtimeInputs = new Input(args);

        this.inputs.checkRequiredArgs(runtimeInputs);
        const data = await readFile(`${__dirname}/../static/workflows/template-workflow.yaml`);
        const workflow: GenericK8sSpecType = load(data.toString());

        workflow.metadata.generateName = `${this.name}-`;
        if (serviceAccountName) workflow.spec.serviceAccountName = serviceAccountName;
        workflow.spec.entrypoint = this.name;
        if (imagePullSecrets) workflow.spec.imagePullSecrets = [{ name: imagePullSecrets }];
        workflow.spec.templates[0].name = this.name;
        workflow.spec.templates[0].dag.tasks[0].name = `call-${this.name}`;
        workflow.spec.templates[0].dag.tasks[0].templateRef.name = packageName;
        workflow.spec.templates[0].dag.tasks[0].templateRef.template = this.name;
        workflow.spec.templates[0].dag.tasks[0].templateRef.clusterScope = cluster;
        workflow.spec.templates[0].dag.tasks[0].arguments = runtimeInputs;

        return workflow;
    }

    /**
     * Generate Templates
     * @param {[Object]} templateArray
     * @returns
     */
    static generate(templateArray: any[]) {
        return templateArray.map((templateObj: any) => new Template(templateObj));
    }
}
