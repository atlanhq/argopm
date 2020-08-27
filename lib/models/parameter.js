'use strict';
const { red, green} = require ('ansicolor')


class Parameter {
    /**
     * @param {Object} parameter
     */
    constructor(parameter) {
        this.name = parameter.name;
        this.value = parameter.value;
    }

    toString() {
        const name = this.value ? green(this.name) : red(this.name);
        return `${name} ${this.value}`
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