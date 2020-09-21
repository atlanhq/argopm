'use strict';
const { cyan, green, lightCyan} = require ('ansicolor')


class Parameter {
    /**
     * @param {Object} parameter
     */
    constructor(parameter) {
        this.name = parameter.name;
        this.value = parameter.value;
        this.isRequired = false;
        if (this.value === undefined) {
            this.isRequired = true;
        }
    }

    info() {
        const name = this.value ? green(this.name) : cyan(this.name);
        return `${name} ${lightCyan(this.value)}`
    }
}

/**
 * Generate Parameters
 * @param {[Object]} parameterArray
 * @returns {[Parameter]}
 */
Parameter.generate = function(parameterArray) {
    let parameters = [];
    if (!parameterArray) return parameters;

    parameterArray.forEach(parameterObj => {
        parameters.push(new Parameter(parameterObj));
    })
    return parameters
}

exports.Parameter = Parameter;