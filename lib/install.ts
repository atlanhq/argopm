import { K8sInstaller } from "./k8s";
import { S3 } from "./s3";
import { listDirs, deleteDir } from "./utils";
import { readFileSync, existsSync } from "fs";
import { DashboardInstaller } from "./dashboard";
import { constants } from "./constants";

import system = require("system-commands");
import npa = require("npm-package-arg");

/**
 * Downloads the given package
 *
 * @param {String} prefixPath Directory to install
 * @param {String} packageName Argo package name
 * @param {String} registry Argo Package registry
 * @param {String} saveParam Save parameter
 */
const npmInstall = function (prefixPath: string, packageName: string, registry: string, saveParam: string) {
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
export const installGlobal = async function (
    packageName: string,
    registry: string,
    namespace: string,
    cluster: boolean,
    options
) {
    let dirPath = `/tmp/argopm/${packageName}`;
    dirPath = dirPath.split("@").slice(0, -1).join("@");
    let mainPackageName: string | null | undefined = packageName;
    mainPackageName = await install(packageName, registry, namespace, false, cluster, options, dirPath);
    deleteDir(dirPath);
    return mainPackageName;
};

/**
 * Get Package name from path
 * @param path
 * @returns {string}
 */
const packageNameFromPath = function (path): string {
    const packageJSONFilePath = `${path}/package.json`;
    const packageObject = JSON.parse(readFileSync(packageJSONFilePath, "utf-8"));
    return `${packageObject.name}@${packageObject.version}`;
};

const processInstallers = (
    dir: string,
    cluster: boolean,
    namespace: string,
    parentPackageName: string,
    registry: string,
    options: any
) => {
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

    k8sInstaller.install(cluster);
    dashboardInstaller.install();
    s3Uploader.initialize();
    s3Uploader.uploadStaticFiles(dir);
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
export const install = async function (
    packageName: string,
    registry: string,
    namespace: string,
    save: boolean,
    cluster: boolean,
    options,
    dirPath: string = process.cwd()
) {
    // dirPath = "/Users/amit/Documents/marketplace-packages/atlan-atlas";
    let npmSaveParam = "--no-save";
    if (save) {
        npmSaveParam = "--save";
    }

    const packageJSONFilePath = `${dirPath}/package.json`;
    if (packageName === "." && save) {
        if (!existsSync(packageJSONFilePath)) {
            throw new Error(`package.json is not present in the current dir ${dirPath}. Try with --no-save argument`);
        }
    }

    let parentPackageName = packageName;
    npmInstall(dirPath, packageName, registry, npmSaveParam);
    const nodeModulesPath = `${dirPath}/node_modules`;

    let dirs: (string | undefined)[] = [];
    if (!existsSync(nodeModulesPath)) {
        return;
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

    console.log(`Installing parent package ${parentPackageName}`);
    dirs = (await listDirs(nodeModulesPath)).filter((dir) => dir !== undefined);
    dirs.forEach(async (dir) => {
        if (dir && dir?.split("/").slice(-1)[0].startsWith("@")) {
            const innerDirs = await listDirs(dir);
            innerDirs.forEach((innerDir) => {
                if (innerDir) {
                    processInstallers(innerDir, cluster, namespace, parentPackageName, registry, options);
                }
            });
        } else {
            if (dir) {
                processInstallers(dir, cluster, namespace, parentPackageName, registry, options);
            }
        }
    });

    if (packageName !== ".") {
        return;
    }

    const s3Uploader = new S3(
        constants.ATLAN_DEFAULTS_CONFIGMAP_NAME,
        constants.ATLAN_DEFAULTS_CONFIGMAP_NAMESPACE,
        npa(packageNameFromPath(dirPath))
    );

    const k8sInstaller = new K8sInstaller(dirPath, namespace, parentPackageName, "local", options);
    const dashboardInstaller = new DashboardInstaller(k8sInstaller.package, dirPath);

    try {
        k8sInstaller.install(cluster);
        dashboardInstaller.install();
        s3Uploader.initialize();
        s3Uploader.uploadStaticFiles(dirPath);
    } catch (err) {
        console.error(err);
    }

    const parsedPackage = npa(parentPackageName);
    return parsedPackage.name;
};
