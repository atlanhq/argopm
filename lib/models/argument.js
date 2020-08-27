'use strict';
const Parameter = require("./parameter").Parameter;

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
}

exports.Argument = Argument;