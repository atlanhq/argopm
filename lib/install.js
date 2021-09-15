'use strict';
const Promise = require("bluebird");
const system = require('system-commands');
const npa = require('npm-package-arg');
const K8sInstaller = require("./k8s").K8sInstaller;
const listDirs = require("./utils").listDirs;
const deleteDir = require("./utils").deleteDir;
const fs = require("fs");

/**
 * Downloads the given package
 *
 * @param {String} prefixPath Directory to install
 * @param {String} packageName Argo package name
 * @param {String} registry Argo Package registry
 * @param {String} saveParam Save parameter
 */
const npmInstall = function (prefixPath, packageName, registry, saveParam) {
    if (packageName === ".") {
        return system(`NPM_CONFIG_REGISTRY=${registry} npm i ${saveParam} --prefix ${prefixPath} --force`);
    }
    return system(`NPM_CONFIG_REGISTRY=${registry} npm i ${packageName} ${saveParam} --prefix ${prefixPath} --force`);
};


/**
 * Install a global package
 *
 * @param {string} packageName
 * @param {string} registry
 * @param {string} namespace
 * @param {boolean} cluster
 */
const installGlobal = function (packageName, registry, namespace, cluster, options) {
    const dirPath = `/tmp/argopm/${packageName}`
    let mainPackageName = packageName;
    return install(packageName, registry, namespace, false, cluster, options, dirPath).then(name => {
        mainPackageName = name;
        return deleteDir(dirPath);
    }).then(_ => {
        return mainPackageName;
    });
}

exports.installGlobal = installGlobal;


/**
 * Get Package name from path
 * @param path
 * @returns {string}
 */
const packageNameFromPath = function(path) {
    const packageJSONFilePath = `${path}/package.json`
    const packageObject = JSON.parse(fs.readFileSync(packageJSONFilePath, 'utf-8'));
    return `${packageObject.name}@${packageObject.version}`
}

/**
 * Install a package
 *
 * @param {string} packageName
 * @param {string} registry
 * @param {string} namespace
 * @param {boolean} save
 * @param {boolean} cluster
 * @param {string} dirPath
 */
const install = function (packageName, registry, namespace, save, cluster, options, dirPath = process.cwd()) {
    dirPath = "/tmp/test-package";
    let npmSaveParam = "--no-save"
    if (save) {
        npmSaveParam = "--save"
    }

    const packageJSONFilePath = `${dirPath}/package.json`
    if (packageName === "." || save) {
        if (!fs.existsSync(packageJSONFilePath)) {
            return new Promise(function(_, reject) {
                reject(`package.json is not present in the current dir ${dirPath}. Try with --no-save argument`);
            })
        }
    }

    let parentPackageName = packageName;
    if (packageName === ".") {
        parentPackageName = packageNameFromPath(dirPath);
    }

    return npmInstall(dirPath, packageName, registry, npmSaveParam).then(_ => {
        if (packageName !== ".") {
            parentPackageName = packageNameFromPath(`${dirPath}/node_modules/${packageName}`)
        }

        const nodeModulesPath = `${dirPath}/node_modules`
        if (!fs.existsSync(nodeModulesPath)) {
            return [];
        }
        return listDirs(nodeModulesPath);
    }).then(dirs => {
        dirs = dirs.filter(dir => dir != undefined)
        return Promise.each(dirs, function(dir) {
            if (dir.split("/").slice(-1)[0].startsWith("@")) {
                return listDirs(dir).then(innerDirs => {
                    return Promise.each(innerDirs, function(innerDir) {
                        const k8sInstaller = new K8sInstaller(innerDir, namespace, parentPackageName, registry, options);
                        return k8sInstaller.install(cluster);
                    })
                })
            }

            const k8sInstaller = new K8sInstaller(dir, namespace, parentPackageName, registry, options);
            return k8sInstaller.install(cluster);
        })
    }).then(_ => {
        // Install the current package
        if (packageName !== ".") {
            return;
        }
        const k8sInstaller = new K8sInstaller(dirPath, namespace, parentPackageName, "local", options);
        return k8sInstaller.install(cluster);
    }).then(_ => {
        const parsedPackage = npa(parentPackageName);
        return parsedPackage.name;
    });
}

exports.install = install;