import { PathLike } from "node:fs";
import { FileHandle, readdir, readFile, writeFile } from "node:fs/promises";

import system = require("system-commands");
import { walk } from "./utils";

/**
 * Init an Argo package inside the folder
 * Steps:
 * 1. Check if folder is empty
 * 2. Package.json should not be present (unless force is set to true)
 * 3. Copy the static folder in the current directory
 * 4. Change name to the folder name
 * @param {boolean} force
 */
export const init = async (force: boolean, inputPackageName: unknown) => {
    // const dirPath = "/tmp/test-package";
    const dirPath = process.cwd();
    const pathComponents = dirPath.split("/");
    const packageName = inputPackageName != "." || pathComponents[pathComponents.length - 1];
    const files = await readdir(dirPath);

    if (!force && (files.length !== 0 || files.includes("package.json"))) {
        throw `Files already present in the ${__dirname}. Run this command again with --force to ignore`;
    }

    const skeletonPackagePath = `${__dirname}/static/package`;
    await system(`cp -r ${skeletonPackagePath}/ ${dirPath}`);
    await walk(dirPath);
    files.forEach((file) => {
        replaceInFile(file, "NAME", packageName);
    });

    return packageName;
};

function replaceInFile(filePath: PathLike | FileHandle, searchText: string | RegExp, replaceText: string) {
    const re = new RegExp(searchText, "g");
    return readFile(filePath, "utf-8").then((data) => {
        const result = data.replace(re, replaceText);
        return writeFile(filePath, result, "utf8");
    });
}
