import { red } from "ansicolor";
import { existsSync, readFileSync, writeFileSync } from "fs";
import shell from "shelljs";
import { getDirName } from "./utils.mjs";

/**
 * Init an Argo package inside the folder
 * Steps:
 * 1. Check if folder is empty
 * 2. Package.json should not be present (unless force is set to true)
 * 3. Copy the static folder in the current directory
 * 4. Change name to the folder name
 * @param {boolean} force
 */
export const init = async (namespace: string, createNamespace: boolean, registry: string, cluster: boolean) => {
    const dirPath = shell.pwd();
    const packageJsonPath = `${dirPath}/package.json`;
    const __dirname = getDirName(import.meta.url);

    const pathComponents = dirPath.split("/");
    const packageName = pathComponents[pathComponents.length - 1];
    console.log(`Installing from the current directory (${dirPath}) with the package name "${packageName}"...`);

    if (existsSync(packageJsonPath)) {
        console.error(red(`Files already present in the ${dirPath}. Run this command again with --force to ignore`));
        process.exit(1);
    }

    const skeletonPackagePath = `${__dirname}/static/package`;
    shell.cp("-R", `${skeletonPackagePath}/*`, dirPath);
    shell.sed("-i", /NAME/g, packageName, `${dirPath}/*.*`);

    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
    packageJson.argopm = { namespace, createNamespace, registry, cluster };

    writeFileSync(packageJsonPath, JSON.stringify(packageJson, undefined, 2));

    return packageName;
};
