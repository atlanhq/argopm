"use strict";
const Promise = require("bluebird");
const npa = require("npm-package-arg");
const K8sInstaller = require("./k8s").K8sInstaller;
const S3 = require("./s3").S3;
const listDirs = require("./utils").listDirs;
const appendToFileSync = require("./utils").appendToFileSync;
const fs = require("fs");
const { DashboardInstaller } = require("./dashboard");
const { constants } = require("./constants");

const LOCAL_ONLY_ERROR =
    "argopm only supports local installs. Use 'argopm install .' from a package directory. " +
    "Remote registry fetch has been disabled.";

// Remote-registry fetching has been removed. argopm installs only from local package directories (`.`).
// The `registry` and `saveParam` parameters are retained so existing call sites keep working;
// both are ignored.
// eslint-disable-next-line no-unused-vars
const npmInstall = function (prefixPath, packageName, registry, saveParam) {
    if (packageName === ".") {
        return Promise.resolve();
    }
    return Promise.reject(new Error(LOCAL_ONLY_ERROR));
};

// Global install required a remote registry and has been disabled. Signature preserved so
// `bin/install.js` still resolves the export; calling it always fails closed.
// eslint-disable-next-line no-unused-vars
const installGlobal = function (packageName, registry, namespace, cluster, options) {
    return Promise.reject(
        new Error("argopm global install has been disabled. Use local installs ('argopm install .') only.")
    );
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
 * Get Package details from path
 * @param path {string}
 * @returns {{name:string,version:string,dependencies:Object<string,any>}}
 */
const packageDetailsFromPath = function (path) {
    const packageJSONFilePath = `${path}/package.json`;
    const packageManifest = JSON.parse(fs.readFileSync(packageJSONFilePath, "utf-8"));
    return {
        name: packageManifest.name,
        version: packageManifest.version,
        dependencies: packageManifest.dependencies || {},
    };
};

/**
 * Install a package
 *
 * @param {string} packageName
 * @param {string} registry
 * @param {string} namespace
 * @param {boolean} save
 * @param {boolean} cluster
 * @param {{force:boolean,cronString:string,timeZone,preview:boolean,azure:boolean,exportPackageNameFilePath:string}} options
 * @param {string} dirPath
 */
const install = function (packageName, registry, namespace, save, cluster, options, dirPath = process.cwd()) {
    //dirPath = "/Users/viplove/marketplace-packages/packages/atlan/databricks";
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
                                installed.push(packageDetailsFromPath(innerDir));
                                return Promise.resolve(); // Skip installation
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
                                    installed.push(packageDetailsFromPath(innerDir));
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
                    installed.push(packageDetailsFromPath(dir));
                    return Promise.resolve(); // skip installation
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
                        installed.push(packageDetailsFromPath(dir));
                    })
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
                installed.push(packageDetailsFromPath(dirPath));
                return Promise.resolve(); // Skip installation
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
                    installed.push(packageDetailsFromPath(dirPath));
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
                console.log(JSON.stringify(installed, null, 2));
            }
            if (options.exportPackageNameFilePath !== "") {
                var packageSet = new Set();
                installed.forEach(function (data) {
                    packageSet.add(data.name);
                });
                appendToFileSync(options.exportPackageNameFilePath, Array.from(packageSet).join(","));
            }
            const parsedPackage = npa(parentPackageName);
            return parsedPackage.name;
        });
};

exports.install = install;
exports.installGlobal = installGlobal;
