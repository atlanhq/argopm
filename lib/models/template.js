'use strict';
const Input = require("./input").Input;
const Promise = require("bluebird");
const fs = Promise.promisifyAll(require("fs"));
const yaml = require("js-yaml");

const { blue, bright } = require ('ansicolor')

class Template {

    /**
     * @param {Object} templateObj
     */
    constructor(templateObj) {
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
     * @returns {PromiseLike<{Object}>}
     */
    generateWorkflow(packageName, args, serviceAccountName) {
        const runtimeInputs = new Input(args);
        const capturedThis = this;

        return this.inputs.checkRequiredArgs(runtimeInputs).then(_ => {
            return fs.readFileAsync(`${__dirname}/../static/workflows/template-workflow.yaml`);
        }).then(data => {
            return yaml.safeLoad(data);
        }).then(workflow => {
            const name = capturedThis.name;
            workflow.metadata.generateName = `${name}-`;
            workflow.spec.serviceAccountName = serviceAccountName;
            workflow.spec.entrypoint = name;
            workflow.spec.templates[0].name = name;
            workflow.spec.templates[0].dag.tasks[0].name = `call-${name}`;
            workflow.spec.templates[0].dag.tasks[0].templateRef.name = packageName;
            workflow.spec.templates[0].dag.tasks[0].templateRef.template = name;
            workflow.spec.templates[0].dag.tasks[0].arguments = runtimeInputs;
            return workflow;
        })
    }
}

/**
 * Generate Templates
 * @param {[Object]} templateArray
 * @returns {[Template]}
 */
Template.generate = function(templateArray) {
    let templates = [];
    if (!templateArray) return templates;

    templateArray.forEach(templateObj => {
        templates.push(new Template(templateObj));
    })
    return templates;
}

exports.Template = Template;