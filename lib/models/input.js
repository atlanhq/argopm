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
}

exports.Input = Input;