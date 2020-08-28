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
     * @param {Object} args
     */
    checkRequiredArgs(args) {
        this.parameters.forEach(parameter => {
            if (parameter.isRequired && args[parameter.name] === undefined ) {
                throw `Required parameter missing ${parameter.name}`;
            }
        })
    }
}

exports.Input = Input;