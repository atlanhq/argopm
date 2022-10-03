import { K8sInstaller, K8sInstallerOptionsType } from "./k8s.mjs";
import { S3 } from "./s3.mjs";
import { listDirs, deleteDir } from "./utils.mjs";
import { readFileSync, existsSync } from "fs";
import { DashboardInstaller } from "./dashboard.mjs";
import { constants } from "./constants.mjs";
import shell from "shelljs";

// import system from "system-commands";
import npa from "npm-package-arg";
import process from "process";

/**
 * Downloads the given package
 *
 * @param {string} prefixPath Directory to install
 * @param {string} packageName Argo package name
 * @param {string} registry Argo Package registry
 * @param {string} saveParam Save parameter
 */
const npmInstall = function (prefixPath: string, packageName: string, registry: string, save: boolean) {
    let command: string;
    const saveParam = save ? "--save" : "--no-save";
    if (packageName === ".") {
        command = `NPM_CONFIG_REGISTRY=${registry} npm i ${saveParam} --prefix ${prefixPath} --force`;
    } else {
        command = `NPM_CONFIG_REGISTRY=${registry} npm i ${packageName} ${saveParam} --prefix ${prefixPath} --force`;
    }
    return shell.exec(command, { fatal: true });
};

/**
 * Install a global package
 * @param  {string} packageName
 * @param  {string} registry
 * @param  {string} namespace
 * @param  {boolean} cluster
 * @param  {K8sInstallerOptionsType} options
 */
export const installGlobal = async function (
    packageName: string,
    registry: string,
    namespace: string,
    cluster: boolean,
    options: K8sInstallerOptionsType
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
 * @param  {string} path
 * @returns string
 */
const packageNameFromPath = function (path: string): string {
    const packageJSONFilePath = `${path}/package.json`;
    const packageObject = JSON.parse(readFileSync(packageJSONFilePath, "utf-8"));
    return `${packageObject.name}@${packageObject.version}`;
};

/**
 * Execute k8sInstaller and dashboardInstaller.
 * @param  {string} dirPath
 * @param  {boolean} cluster
 * @param  {string} namespace
 * @param  {string} parentPackageName
 * @param  {string} registry
 * @param  {K8sInstallerOptionsType} options
 */
const processInstallers = async (
    dirPath: string,
    cluster: boolean,
    namespace: string,
    parentPackageName: string,
    registry: string,
    options: K8sInstallerOptionsType
) => {
    // Upload Static Files
    const s3Uploader = new S3(
        constants.ATLAN_DEFAULTS_CONFIGMAP_NAME,
        constants.ATLAN_DEFAULTS_CONFIGMAP_NAMESPACE,
        npa(packageNameFromPath(dirPath))
    );

    // Install Template on Argo
    const k8sInstaller = new K8sInstaller(dirPath, namespace, parentPackageName, registry, options);

    // Install Dashboards
    const dashboardInstaller = new DashboardInstaller(k8sInstaller.package, dirPath);

    await k8sInstaller.install(cluster);
    await dashboardInstaller.install();
    await s3Uploader.initialize();
    return await s3Uploader.uploadStaticFiles(dirPath);
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
    options: K8sInstallerOptionsType,
    dirPath: string = process.cwd()
) {
    const packageJSONFilePath = `${dirPath}/package.json`;
    if (packageName === "." && save && !existsSync(packageJSONFilePath)) {
        throw new Error(`package.json is not present in the current dir ${dirPath}. Try with --no-save argument`);
    }

    let parentPackageName = packageName;
    const npmInstallResult = npmInstall(dirPath, packageName, registry, save);
    console.log(npmInstallResult.stdout);

    let dirs: string[] = [];

    const nodeModulesPath = `${dirPath}/node_modules`;
    if (existsSync(nodeModulesPath)) {
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
    }

    dirs.forEach(async (dir) => {
        if (dir && dir?.split("/").slice(-1)[0].startsWith("@")) {
            const innerDirs = await listDirs(dir);
            innerDirs.forEach(async (innerDir) => {
                await processInstallers(innerDir, cluster, namespace, parentPackageName, registry, options);
            });
        } else {
            await processInstallers(dir, cluster, namespace, parentPackageName, registry, options);
        }
    });

    if (packageName === ".") {
        await processInstallers(dirPath, cluster, namespace, parentPackageName, registry, options);
    }

    const parsedPackage = npa(parentPackageName);
    return parsedPackage.name;
};
