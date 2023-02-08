"use strict";
const Promise = require("bluebird");
const system = require("system-commands");
const npa = require("npm-package-arg");
const K8sInstaller = require("./k8s").K8sInstaller;
const S3 = require("./s3").S3;
const listDirs = require("./utils").listDirs;
const deleteDir = require("./utils").deleteDir;
const fs = require("fs");
const { DashboardInstaller } = require("./dashboard");
const { constants } = require("./constants");

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
    let dirPath = `/tmp/argopm/${packageName}`;
    dirPath = dirPath.split("@").slice(0, -1).join("@");
    let mainPackageName = packageName;
    return install(packageName, registry, namespace, false, cluster, options, dirPath)
        .then((name) => {
            mainPackageName = name;
            return deleteDir(dirPath);
        })
        .then((_) => {
            return mainPackageName;
        });
};

exports.installGlobal = installGlobal;

/**
 * Get Package name from path
 * @param path
 * @returns {string}
 */
const packageNameFromPath = function (path) {
    const packageJSONFilePath = `${path}/package.json`;
    const packageObject = JSON.parse(fs.readFileSync(packageJSONFilePath, "utf-8"));
    return `${packageObject.name}@${packageObject.version}`;
};

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
    // dirPath = "/Users/amit/Documents/marketplace-packages/atlan-atlas";
    let npmSaveParam = "--no-save";
    if (save) {
        npmSaveParam = "--save";
    }

    const packageJSONFilePath = `${dirPath}/package.json`;
    if (packageName === "." && save) {
        if (!fs.existsSync(packageJSONFilePath)) {
            return new Promise(function (_, reject) {
                reject(`package.json is not present in the current dir ${dirPath}. Try with --no-save argument`);
            });
        }
    }

    const installed = [];
    let parentPackageName = packageName;
    return npmInstall(dirPath, packageName, registry, npmSaveParam)
        .then((_) => {
            const nodeModulesPath = `${dirPath}/node_modules`;

            if (!fs.existsSync(nodeModulesPath)) {
                return [];
            }

            if (packageName !== ".") {
                const cleanedPackageParts = packageName.split("@");
                let cleanedPackageName = cleanedPackageParts.slice(0, -1).join("@");
                if (cleanedPackageName == "") {
                    cleanedPackageName = packageName;
                }

                parentPackageName = packageNameFromPath(`${nodeModulesPath}/${cleanedPackageName}`);
            } else {
                parentPackageName = packageNameFromPath(`${dirPath}`);
                registry = "local";
            }
            if (!options.preview) {
                console.log(`Installing parent package ${parentPackageName}`);
            }
            return listDirs(nodeModulesPath);
        })
        .then((dirs) => {
            dirs = dirs.filter((dir) => dir != undefined);
            return Promise.each(dirs, function (dir) {
                if (dir.split("/").slice(-1)[0].startsWith("@")) {
                    return listDirs(dir).then((innerDirs) => {
                        return Promise.each(innerDirs, function (innerDir) {
                            if (options.preview) {
                                installed.push(packageNameFromPath(innerDir));
                                return Promise.resolve();
                            }

                            // Upload Static Files
                            const s3Uploader = new S3(
                                constants.ATLAN_DEFAULTS_CONFIGMAP_NAME,
                                constants.ATLAN_DEFAULTS_CONFIGMAP_NAMESPACE,
                                npa(packageNameFromPath(innerDir))
                            );

                            // Install Template on Argo
                            const k8sInstaller = new K8sInstaller(
                                innerDir,
                                namespace,
                                parentPackageName,
                                registry,
                                options
                            );

                            // Install Dashboards
                            const dashboardInstaller = new DashboardInstaller(k8sInstaller.package, innerDir);

                            return k8sInstaller
                                .install(cluster)
                                .then((_) => {
                                    return dashboardInstaller.install();
                                })
                                .then(() => {
                                    return s3Uploader
                                        .initialize()
                                        .then((_) => {
                                            return s3Uploader.uploadStaticFiles(innerDir);
                                        })
                                        .catch(console.error);
                                });
                        });
                    });
                }

                if (options.preview) {
                    installed.push(packageNameFromPath(dir));
                    return Promise.resolve();
                }

                // Upload Static Files
                const s3Uploader = new S3(
                    constants.ATLAN_DEFAULTS_CONFIGMAP_NAME,
                    constants.ATLAN_DEFAULTS_CONFIGMAP_NAMESPACE,
                    npa(packageNameFromPath(dir))
                );

                // Install Template on Argo
                const k8sInstaller = new K8sInstaller(dir, namespace, parentPackageName, registry, options);

                // Install Dashboards
                const dashboardInstaller = new DashboardInstaller(k8sInstaller.package, dir);

                return k8sInstaller
                    .install(cluster)
                    .then((_) => {
                        return dashboardInstaller.install();
                    })
                    .then(() => {
                        return s3Uploader
                            .initialize()
                            .then((_) => {
                                return s3Uploader.uploadStaticFiles(dir);
                            })
                            .catch(console.error);
                    });
            });
        })
        .then((_) => {
            // Install the current package
            if (packageName !== ".") {
                return Promise.resolve();
            }

            if (options.preview) {
                installed.push(packageNameFromPath("."));
                return Promise.resolve();
            }

            const s3Uploader = new S3(
                constants.ATLAN_DEFAULTS_CONFIGMAP_NAME,
                constants.ATLAN_DEFAULTS_CONFIGMAP_NAMESPACE,
                npa(packageNameFromPath(dirPath))
            );

            const k8sInstaller = new K8sInstaller(dirPath, namespace, parentPackageName, "local", options);
            const dashboardInstaller = new DashboardInstaller(k8sInstaller.package, dirPath);

            return k8sInstaller
                .install(cluster)
                .then((_) => {
                    return dashboardInstaller.install();
                })
                .then(() => {
                    return s3Uploader
                        .initialize()
                        .then((_) => {
                            return s3Uploader.uploadStaticFiles(dirPath);
                        })
                        .catch(console.error);
                });
        })
        .then((_) => {
            if (options.preview) {
                for (const pkg of installed) {
                    console.log(pkg);
                }
            }
            const parsedPackage = npa(parentPackageName);
            return parsedPackage.name;
        });
};

exports.install = install;
exports.installGlobal = installGlobal;
