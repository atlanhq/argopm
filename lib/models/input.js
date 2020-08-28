'use strict';
const Parameter = require("./parameter").Parameter;
const { yellow } = require ('ansicolor')


class Input {
    /**
     * @param {Object} inputsObj
     */
    constructor(inputsObj) {
        if (!inputsObj) {
            inputsObj = {
                parameters: undefined,
                artifacts: undefined
            }
        }
        this.parameters = Parameter.generate(inputsObj.parameters);
    }

    info() {
        let inputHelp = yellow("Inputs:\n")

        inputHelp += `- ${yellow("Parameters: \n")}`
        this.parameters.forEach(parameter => {
            inputHelp += `  - ${parameter.info()}\n`
        })
        return inputHelp;
    }

    /**
     * Check the requirement parameters to run
     * @param {Input} input
     */
    checkRequiredArgs(input) {
        const capturedThis = this;
        return new Promise(function(resolve, reject) {
            capturedThis.parameters.forEach(parameter => {
                if (parameter.isRequired && !input.getParameterValue(parameter.name) ) {
                    reject(`Required parameter missing '${parameter.name}'`);
                }
            })
            resolve();
        });
    }

    /**
     * Get Parameter value for a key
     * @param {string} key
     * @returns {string}
     */
    getParameterValue(key) {
        let value = undefined;
        this.parameters.forEach(parameter => {
            if (parameter.name === key) value = parameter.value
        })
        return value;
    }
}

exports.Input = Input;