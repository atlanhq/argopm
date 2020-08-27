'use strict';
const Input = require("./input").Input;
const { blue, bright } = require ('ansicolor')

class Template {

    /**
     * @param {Object} templateObj
     */
    constructor(templateObj) {
        this.name = templateObj.name;
        this.inputs = new Input(templateObj.inputs);
    }

    toString() {
        let templateHelp = blue(`Template: ${bright(this.name)}\n`);
        templateHelp += `${this.inputs.toString()}`;
        return templateHelp;
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