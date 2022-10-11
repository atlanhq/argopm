import { cyan, green, lightCyan } from "ansicolor";

export class Parameter {
    name: string;
    value: any;
    isRequired = false;

    /**
     * @param
     */
    constructor({ name, value }) {
        this.name = name;
        this.value = value;
        if (this.value === undefined) {
            this.isRequired = true;
        }
    }

    info() {
        const name = this.value ? green(this.name) : cyan(this.name);
        return `${name} ${lightCyan(this.value)}`;
    }

    static generate(parameterArray: any[]) {
        const parameters: Parameter[] = [];
        if (!parameterArray) return parameters;

        parameterArray.forEach((parameterObj: { name: any; value: any }) => {
            parameters.push(new Parameter(parameterObj));
        });
        return parameters;
    }
}
