import { Parameter } from "./parameter";
import { yellow } from "ansicolor";

export class Input {
    parameters: Parameter[];

    /**
     * @param {Object} inputsObj
     */
    constructor(inputsObj) {
        if (!inputsObj) {
            inputsObj = {
                parameters: undefined,
                artifacts: undefined,
            };
        }
        this.parameters = Parameter.generate(inputsObj.parameters);
    }

    info() {
        let inputHelp = yellow("Inputs:\n");

        inputHelp += `- ${yellow("Parameters: \n")}`;
        this.parameters.forEach((parameter) => {
            inputHelp += `  - ${parameter.info()}\n`;
        });
        return inputHelp;
    }

    /**
     * Check the requirement parameters to run
     * @param {Input} input
     */
    checkRequiredArgs(input) {
        this.parameters.forEach((parameter) => {
            if (parameter.isRequired && input.getParameterValue(parameter.name) === undefined) {
                throw new Error(`Required parameter missing '${parameter.name}'`);
            }
        });
        return true;
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
