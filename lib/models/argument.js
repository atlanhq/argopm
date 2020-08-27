'use strict';
const Parameter = require("./parameter").Parameter;
const { yellow } = require ('ansicolor');

class Argument {
    /**
     * @param {Object} argumentObj
     */
    constructor(argumentObj) {
        if (!argumentObj) {
            argumentObj = {
                parameters: undefined,
                artifacts: undefined
            }
        }
        this.parameters = Parameter.generate(argumentObj.parameters);
    }

    info() {
        let argumentInfo = yellow("Arguments:\n")

        argumentInfo += `- ${yellow("Parameters: \n")}`
        this.parameters.forEach(parameter => {
            argumentInfo += `  - ${parameter.info()}\n`
        })
        return argumentInfo;
    }
}

exports.Argument = Argument;