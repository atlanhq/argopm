import { Parameter } from "./parameter.mjs";
import { yellow } from "ansicolor";

export class Argument {
    parameters: Parameter[];

    /**
     * @param
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
     * @param
     */
    checkRequiredArgs(args) {
        this.parameters.forEach((parameter) => {
            if (parameter.isRequired && args.getParameterValue(parameter.name) === undefined) {
                throw new Error(`Required parameter missing ${parameter.name}`);
            }
        });
        return true;
    }

    /**
     * Get Parameter value for a key
     * @param {string} key
     * @returns
     */
    getParameterValue(key: string) {
        return this.parameters.find((parameter) => parameter.name === key);
    }
}
