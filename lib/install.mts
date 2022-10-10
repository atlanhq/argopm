import { appendDryRunTag, K8sInstaller, K8sInstallerOptionsType } from "./k8s.mjs";
import { S3 } from "./s3.mjs";
import { listDirs, deleteDir, applyColor } from "./utils.mjs";
import { readFileSync, existsSync } from "fs";
import { DashboardInstaller } from "./dashboard.mjs";
import { constants } from "./constants.mjs";
import shell from "shelljs";

// import system from "system-commands";
import npa from "npm-package-arg";
import process from "process";
import { red, yellow } from "ansicolor";
import { installHelp } from "./help.mjs";

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
        command = `NPM_CONFIG_REGISTRY=${registry} npm i ${saveParam} --prefix ${prefixPath} --force --silent`;
    } else {
        command = `NPM_CONFIG_REGISTRY=${registry} npm i ${packageName} ${saveParam} --prefix ${prefixPath} --force --silent`;
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
    excludeDependencies: boolean,
    dryRun: boolean,
    color: boolean,
    options: K8sInstallerOptionsType,
    installParts: { [k: string]: string[] }
) {
    let dirPath = `/tmp/argopm/${packageName}`;
    dirPath = dirPath.split("@").slice(0, -1).join("@");
    const mainPackageName = await install(
        packageName,
        registry,
        namespace,
        false,
        cluster,
        excludeDependencies,
        dryRun,
        color,
        options,
        installParts,
        dirPath
    );
    await deleteDir(dirPath);
    return mainPackageName;
};

/**
 * Get Package name from path
 * @param  {string} path
 * @returns string
 */
export const packageNameFromPath = function (path: string): string {
    const packageJSONFilePath = `${path}/package.json`;
    const packageObject = JSON.parse(readFileSync(packageJSONFilePath, "utf-8"));
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
export const install = async function (
    packageName: string,
    registry: string,
    namespace: string,
    save: boolean,
    cluster: boolean,
    excludeDependencies: boolean,
    dryRun: boolean,
    color: boolean,
    options: K8sInstallerOptionsType,
    installParts: { [k: string]: string[] },
    dirPath: string = process.cwd()
) {
    let parentPackageName = packageName;
    const nodeModulesPath = `${dirPath}/node_modules`;

    const processInstallers = async (_dirPath: string) => {
        // Upload Static Files
        const s3Uploader = new S3(
            constants.ATLAN_DEFAULTS_CONFIGMAP_NAME,
            constants.ATLAN_DEFAULTS_CONFIGMAP_NAMESPACE,
            npa(packageNameFromPath(_dirPath))
        );

        // Install Template on Argo
        const k8sInstaller = new K8sInstaller(_dirPath, namespace, parentPackageName, registry, dryRun, installParts, options);

        // Install Dashboards
        const dashboardInstaller = new DashboardInstaller(k8sInstaller.package, _dirPath);

        const k8sInstalled = await k8sInstaller.install(cluster,);
        await dashboardInstaller.install();
        await s3Uploader.initialize();
        await s3Uploader.uploadStaticFiles(_dirPath);
        return k8sInstalled;
    };

    const packageJSONFilePath = `${dirPath}/package.json`;
    if (packageName === "." && save && !existsSync(packageJSONFilePath)) {
        console.error(
            red(`package.json is not present in the current dir ${dirPath}. Try with --no-save argument`)
        );
        process.exit(1);
    }

    npmInstall(dirPath, packageName, registry, save);

    let dirs: string[] = [];
    let toInstall = [];

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

        console.log(yellow(`Installing parent package ${parentPackageName}`));
        dirs = await listDirs(nodeModulesPath);
        dirs = dirs.filter((dir) => dir !== undefined);
    }

    for (const dir of dirs) {
        if (dir && dir?.split("/").slice(-1)[0].startsWith("@")) {
            const innerDirs = await listDirs(dir);
            innerDirs.forEach(async (innerDir) => {
                toInstall.push(processInstallers(innerDir));
            });
        } else {
            toInstall.push(processInstallers(dir));
        }
    }

    if (packageName === ".") {
        parentPackageName = packageNameFromPath(`${dirPath}`);
        toInstall.push(processInstallers(dirPath));
    }

    const k8sInstalled = await Promise.all(toInstall).then(results => results.reduce((prev, curr) => prev + curr));

    const parsedPackage = npa(parentPackageName);

    appendDryRunTag(dryRun, `Installed ${k8sInstalled} Kubernetes resources.`);

    if (k8sInstalled && !dryRun) {
        console.log(applyColor(color, installHelp.replace(/NAME/g, parsedPackage.name)));
    }
};
