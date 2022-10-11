import { Parameter } from "./parameter.mjs";
import { red, yellow } from "ansicolor";

export type InputObjectType = {
    parameters?: any;
    artifacts?: any;
};

export class Input {
    parameters: Parameter[];

    /**
     * @param {Object} inputsObj
     */
    constructor(inputsObj: InputObjectType) {
        if (!inputsObj) {
            inputsObj = {
                parameters: undefined,
                artifacts: undefined,
            };
        }
        this.parameters = Parameter.generate(inputsObj.parameters);
    }

    /**
     * Return info of Input
     * @returns {string}
     */
    info(): string {
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
    checkRequiredArgs(input: Input) {
        for (const parameter of this.parameters) {
            if (parameter.isRequired && input.getParameterValue(parameter.name) === undefined) {
                console.error(red(`Required parameter missing '${parameter.name}'`));
                process.exit(1);
            }
        }
        return true;
    }

    /**
     * Get Parameter value for a key
     * @param {string} key
     * @returns {string}
     */
    getParameterValue(key: string): string {
        let value = undefined;
        this.parameters.forEach((parameter) => {
            if (parameter.name === key) value = parameter.value;
        });
        return value;
    }
}
