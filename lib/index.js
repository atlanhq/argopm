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
exports.uninstall = function(namespace, name, cluster, isPipeline) {
    return Package.info(namespace, name, cluster, isPipeline).then(argoPackage => {
        return argoPackage.delete(cluster);
    })
}

/**
 * Run a package or package template
 * @param {string} namespace
 * @param {string} name
 * @param {string} templateName
 * @param {string} serviceAccountName
 * @param {string} imagePullSecrets
 * @param {Boolean} cluster
 */
exports.run = function (namespace, name, templateName, serviceAccountName, imagePullSecrets, cluster) {
    const runArguments = utils.generateArguments(process.argv);
    return Package.info(namespace, name, cluster).then(argoPackage => {
        if (templateName) return argoPackage.runTemplate(templateName, runArguments, serviceAccountName, imagePullSecrets, cluster, namespace);
        return argoPackage.run(runArguments, serviceAccountName, imagePullSecrets, cluster, namespace);
    })
}