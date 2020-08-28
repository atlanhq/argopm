// ./lib/index.js
const Package = require("./models/package").Package;
const utils = require("./utils");

exports.list = Package.list;
exports.info = Package.info;

/**
 * Delete a package
 * @param {String} namespace
 * @param {String} name
 */
exports.uninstall = function(namespace, name) {
    return Package.info(namespace, name).then(argoPackage => {
        return argoPackage.delete();
    })
}

/**
 * Run a package or package template
 * @param {string} namespace
 * @param {string} name
 * @param {string} templateName
 * @param {string} serviceAccountName
 */
exports.run = function (namespace, name, templateName, serviceAccountName) {
    const runArguments = utils.generateArguments(process.argv);
    return Package.info(namespace, name).then(argoPackage => {
        return argoPackage.run(runArguments, serviceAccountName);
    })
}