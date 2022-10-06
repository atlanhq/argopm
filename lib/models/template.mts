import { blue, bright } from "ansicolor";
import { load } from "js-yaml";
import { readFile } from "node:fs/promises";
import { GenericK8sSpecType } from "../k8s.mjs";
import { getDirName } from "../utils.mjs";
import { Input } from "./input.mjs";

type TemplateObjectType = {
    name: string;
    inputs: any;
};

export class Template {
    name: string;
    inputs: Input;

    /**
     * @param {Object} templateObj
     */
    constructor(templateObj: TemplateObjectType) {
        this.name = templateObj.name;
        this.inputs = new Input(templateObj.inputs);
    }
    /**
     * Get template info.
     * @returns string
     */
    info(): string {
        let templateHelp = blue(`Template: ${bright(this.name)}\n`);
        templateHelp += `${this.inputs.info()}`;
        return templateHelp;
    }

    /**
     * Generate the Workflow manifest
     * @param  {string} packageName
     * @param  {object} args
     * @param  {string} serviceAccountName
     * @param  {string} imagePullSecrets
     * @param  {boolean} cluster
     */
    async generateWorkflow(
        packageName: string,
        args: object,
        serviceAccountName: string,
        imagePullSecrets: string,
        cluster: boolean
    ) {
        const __dirname = getDirName(import.meta.url);
        const runtimeInputs = new Input(args);

        this.inputs.checkRequiredArgs(runtimeInputs);
        const data = await readFile(`${__dirname}/../static/workflows/template-workflow.yaml`);
        const workflow: GenericK8sSpecType = load(data.toString());

        workflow.metadata.generateName = `${this.name}-`;
        if (serviceAccountName) {
            workflow.spec.serviceAccountName = serviceAccountName;
        }

        workflow.spec.entrypoint = this.name;
        if (imagePullSecrets) {
            workflow.spec.imagePullSecrets = [{ name: imagePullSecrets }];
        }

        workflow.spec.templates[0].name = this.name;
        workflow.spec.templates[0].dag.tasks[0].name = `call-${this.name}`;
        workflow.spec.templates[0].dag.tasks[0].templateRef.name = packageName;
        workflow.spec.templates[0].dag.tasks[0].templateRef.template = this.name;
        workflow.spec.templates[0].dag.tasks[0].templateRef.clusterScope = cluster;
        workflow.spec.templates[0].dag.tasks[0].arguments = runtimeInputs;

        return workflow;
    }

    /**
     * Generate a list of templates
     * @param  {TemplateObjectType[]} templateArray
     */
    static generate(templateArray: TemplateObjectType[]) {
        return templateArray.map((templateObj: any) => new Template(templateObj));
    }
}
