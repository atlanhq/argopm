import { join } from "path";
import { readdir, stat, access } from "node:fs/promises";
import { promisify } from "node:util";

import rimraf from "rimraf";
import { Parameter } from "./models/parameter.mjs";
const rimrafPromise = promisify(rimraf);

/**
 * Recursively walk through the folder and return all file paths
 * @param dir
 * @returns
 */
export async function walk(dir: string) {
    const files = await readdir(dir);
    const filesWalked = await Promise.all(
        files.map(async (file: string) => {
            const filePath = join(dir, file);
            const stats = await stat(filePath);
            if (stats.isDirectory()) return walk(filePath);
            else if (stats.isFile()) return filePath;
        })
    );

    return filesWalked.reduce((all: string[], folderContents: string[]) => all.concat(folderContents), []);
}

/**
 * Returns all directories in the given path
 * @param dir
 * @returns
 */
export async function listDirs(dir: string) {
    const paths = await readdir(dir);
    return await Promise.all(
        paths.map(async (file: string) => {
            const filePath = join(dir, file);
            const stats = await stat(filePath);
            if (stats.isDirectory()) return filePath;
        })
    );
}

/**
 * Deletes a directory recursively
 * @param dir
 * @returns
 */
export async function deleteDir(dir: string) {
    // TODO
    await access(dir);
    return await rimrafPromise(dir);
}

/**
 * Generate arguments
 * @param {[string]} args
 * @returns {Object}
 */
export function generateArguments(args: string[]) {
    const index = args.indexOf("--");
    const parameters: Parameter[] = [];

    if (index === -1) return { parameters: parameters };

    let key: string;
    args.slice(index + 1).forEach((arg) => {
        if (!key) {
            key = arg.replace("--", "");
        } else {
            parameters.push(
                new Parameter({
                    name: key,
                    value: arg,
                })
            );
            key = undefined;
        }
    });

    return {
        parameters: parameters,
    };
}
