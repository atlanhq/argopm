import { dirname, join } from "path";
import { readdir, stat, access } from "node:fs/promises";
import { promisify } from "node:util";

import rimraf from "rimraf";
import { Parameter } from "./models/parameter.mjs";
import { hideBin, Parser } from "yargs/helpers";
import { fileURLToPath } from "url";
import { loadYaml } from "@kubernetes/client-node";
import { readFileSync } from "fs";
import { readFile } from "fs/promises";
import { strip } from "ansicolor";

const rimrafPromise = promisify(rimraf);

/**
 * Returns ESM-specific dir name
 * @param {string} url
 * @returns {string} __dirname
 */
export const getDirName = (url: string): string => {
    const __filename = fileURLToPath(url);
    const __dirname = dirname(__filename);
    return __dirname;
};

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
 * @returns
 */
export function generateArguments() {
    const argStartIndex = process.argv.indexOf("--");
    let parameters: Parameter[] = [];

    if (argStartIndex > -1) {
        const runArgv = hideBin(process.argv.slice(argStartIndex - 1));
        const parsedArgs = Parser.detailed(runArgv);
        parameters = Object.entries(parsedArgs.argv)
            .filter(([key, _]) => key !== "_")
            .map(([key, value]) => new Parameter({ name: key, value }));
    }

    return { parameters };
}

/**
 * Parses the YAML file and returns and object of it.
 * 
 * @param path The YAML file path
 * @returns object with the YAML content
 */
export const getResourceFromYaml = async <T,>(path: string) => {
    return loadYaml<T>((await readFile(path)).toString());
};


export const applyColor = (color: boolean, log: any) => color ? log : strip(log);
