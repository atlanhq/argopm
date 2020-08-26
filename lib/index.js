// ./lib/index.js
const Promise = require("bluebird");
const ls = require('npm-remote-ls').ls;
const npa = require('npm-package-arg')
const config = require('npm-remote-ls').config;
const system = require('system-commands');
const fs = Promise.promisifyAll(require("fs"));
const K8sInstaller = require("./k8sinstaller").K8sInstaller;

/**
 * Adds the given packageName to argo
 *
 * @param {String} packageName Package Name
 * @param {String} namespace
 * @param {String} parentPackage
 * @param {String} registry
 */
const k8sInstall = function (packageName, namespace, parentPackage, registry) {
    console.log(`Installing ${packageName}`);
    const parsedPackage = npa(packageName);

    const dir = `node_modules/${parsedPackage.name}`;
    const installer = new K8sInstaller(dir, namespace, parentPackage, registry);
    return installer.install();
};

/**
 * Downloads the given package
 *
 * @param {String} package Argo package name
 * @param {String} registry Argo Package registry
 */
const npmInstall = function (package, registry) {
    return system(`NPM_CONFIG_REGISTRY=${registry} npm i ${package} --no-save`);
};

/**
 * Remove the node modules of the packageName
 * @param {String} packageName
 */
const cleanup = function (packageName) {
    const parsedPackage = npa(packageName);

    const dir = `node_modules/${parsedPackage.name}`;
    console.log(`Cleaning up ${dir}`);
    return fs.rmdirAsync(dir, {recursive: true});
};

/**
 * Generates a dependency list
 *
 * @param {Object} npmPackageObject NPM Package Object
 */
const generateDependencyList = function (npmPackageObject) {
    let dependencyList = [];

    function addToGraph(dependency) {
        if (!dependencyList.includes(dependency)) {
            dependencyList.push(dependency);
        }
    }

    function leafDependency(object) {
        if (Object.keys(object).length === 0) {
            return;
        }

        if (typeof object == "object") {
            for (const [key, value] of Object.entries(object)) {
                leafDependency(value);
                addToGraph(key);
            }
            return;
        }
        addToGraph(object);
    }

    leafDependency(npmPackageObject);
    return dependencyList;
};


/**
 * Installs the given packageName to argo
 *
 * @param {String} packageName Argo packageName name
 * @param {String} namespace Install namespace
 * @param {String} registry Argo Package registry
 */
const argoInstall = function (packageName, namespace, registry) {
    const parsedPackage = npa(packageName);

    config({
        registry: registry
    });

    return npmInstall(packageName, registry).then(output => {
        console.log(output);
        return Promise.fromCallback((cb) => {
            ls(parsedPackage.name, parsedPackage.fetchSpec, false, cb);
        }).catch(error => {
            return error;
        });
    }).then(packageObject => {
        console.log(packageObject);
        return generateDependencyList(packageObject);
    }).then(dependencyList => {
        const mainPackage = dependencyList[dependencyList.length - 1];
        console.log(`${packageName} dependency install list ${dependencyList}`);
        return Promise.each(dependencyList, indvPackage => {
            return k8sInstall(indvPackage, namespace, mainPackage, registry).then((_) => {
                return cleanup(indvPackage);
            })
        });
    });
};

// Allows us to call this function from outside of the library file.
// Without this, the function would be private to this file.
exports.argoInstall = argoInstall;
exports.list = require('./k8sinstaller').listInstalledPackages;