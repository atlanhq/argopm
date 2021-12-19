"use strict";
const Promise = require("bluebird");
const Parameter = require("./parameter").Parameter;
const { yellow } = require("ansicolor");

class Argument {
    /**
     * @param {Object} argumentObj
     */
    constructor(argumentObj) {
        if (!argumentObj) {
            argumentObj = {
                parameters: undefined,
                artifacts: undefined,
            };
        }
        this.parameters = Parameter.generate(argumentObj.parameters);
    }

    info() {
        let argumentInfo = yellow("Arguments:\n");

        argumentInfo += `- ${yellow("Parameters: \n")}`;
        this.parameters.forEach((parameter) => {
            argumentInfo += `  - ${parameter.info()}\n`;
        });
        return argumentInfo;
    }

    /**
     * Check the requirement parameters to run
     * @param {Argument} args
     */
    checkRequiredArgs(args) {
        const capturedThis = this;
        return new Promise(function (resolve, reject) {
            capturedThis.parameters.forEach((parameter) => {
                if (parameter.isRequired && args.getParameterValue(parameter.name) === undefined) {
                    reject(`Required parameter missing ${parameter.name}`);
                }
            });
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
        this.parameters.forEach((parameter) => {
            if (parameter.name === key) value = parameter.value;
        });
        return value;
    }
}

exports.Argument = Argument;
