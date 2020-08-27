// ./lib/index.js
const Package = require("./models/package").Package;

exports.listInstalledPackages = Package.listInstalledPackages;
exports.info = Package.getInstalledPackage;

/**
 * Delete a package
 * @param {String} namespace
 * @param {String} name
 */
exports.deletePackage = function(namespace, name) {
    return Package.getInstalledPackage(namespace, name).then(argoPackage => {
        return argoPackage.delete();
    })
}

