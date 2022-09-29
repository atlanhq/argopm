import { readdir, stat } from "node:fs/promises";
import { join } from "path";

import rimraf = require("rimraf");

/**
 * Recursively walk through the folder and return all file paths
 * @param dir
 * @returns {Promise<[string]>}
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

    return filesWalked.reduce((all: string | any[], folderContents: any) => all.concat(folderContents), []);
}

/**
 * Returns all directories in the given path
 * @param dir
 * @returns
 */
export async function listDirs(dir: string): Promise<(string | undefined)[]> {
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
export function deleteDir(dir: any) {
    // TODO
    return rimraf(dir);
}

/**
 * Generate arguments
 * @param {[string]} args
 * @returns {Object}
 */
export function generateArguments(args: string[]) {
    const index = args.indexOf("--");
    const parameters: { name: string; value: any }[] = [];

    if (index === -1) return { parameters: parameters };

    let key;
    args.slice(index + 1).forEach((arg) => {
        if (!key) {
            key = arg.replace("--", "");
        } else {
            parameters.push({
                name: key,
                value: arg,
            });
            key = undefined;
        }
    });

    return {
        parameters: parameters,
    };
}
