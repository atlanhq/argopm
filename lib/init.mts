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
export const init = async (force: boolean) => {
    // const dirPath = "/tmp/test-package";
    const dirPath = shell.pwd();
    const dirName = getDirName(import.meta.url);

    const pathComponents = dirPath.split("/");
    const packageName = pathComponents[pathComponents.length - 1];
    console.log(`Installing from the current directory (${dirPath}) with the package name "${packageName}"...`);

    if (!force && shell.ls("package.json").length > 0) {
        throw new Error(`Files already present in the ${dirName}. Run this command again with --force to ignore`);
    }

    const skeletonPackagePath = `${dirName}/static/package`;
    shell.cp("-R", `${skeletonPackagePath}/*`, dirPath);
    shell.sed("-i", /NAME/g, packageName, `${dirPath}/*.*`);

    return packageName;
};
