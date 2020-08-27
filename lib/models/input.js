'use strict';
const Parameter = require("./parameter").Parameter;

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

    toString() {
        let inputHelp = "Inputs:\n"

        inputHelp += "Parameters: \n"
        this.parameters.forEach(parameter => {
            inputHelp += `\t${parameter.toString()}\n`
        })
        return inputHelp;
    }
}

exports.Input = Input;