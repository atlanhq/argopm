// ./lib/index.js
const Package = require("./models/package").Package;

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

