// ./lib/index.js
const Package = require("./models/package").Package;
const utils = require("./utils");

exports.list = Package.list;
exports.info = Package.info;

/**
 * Delete a package
 * @param {String} namespace
 * @param {String} name
 * @param {String} cluster
 */
exports.uninstall = function(namespace, name, cluster) {
    return Package.info(namespace, name, cluster).then(argoPackage => {
        return argoPackage.delete();
    })
}

/**
 * Run a package or package template
 * @param {string} namespace
 * @param {string} name
 * @param {string} templateName
 * @param {string} serviceAccountName
 * @param {string} imagePullSecrets
 */
exports.run = function (namespace, name, templateName, serviceAccountName, imagePullSecrets) {
    const runArguments = utils.generateArguments(process.argv);
    return Package.info(namespace, name).then(argoPackage => {
        if (templateName) return argoPackage.runTemplate(templateName, runArguments, serviceAccountName, imagePullSecrets);
        return argoPackage.run(runArguments, serviceAccountName, imagePullSecrets);
    })
}