const Promise = require("bluebird");
const fs = require("fs").promises;
const path = require("path");
var rimraf = Promise.promisify(require("rimraf"));

/**
 * Recursively walk through the folder and return all file paths
 * @param dir
 * @returns {Promise<[string]>}
 */
async function walk(dir) {
    let files = await fs.readdir(dir);
    files = await Promise.all(
        files.map(async (file) => {
            const filePath = path.join(dir, file);
            const stats = await fs.stat(filePath);
            if (stats.isDirectory()) return walk(filePath);
            else if (stats.isFile()) return filePath;
        })
    );

    return files.reduce((all, folderContents) => all.concat(folderContents), []);
}

exports.walk = walk;

/**
 * Returns all directories in the given path
 * @param dir
 * @returns {PromiseLike<[string]> | Promise<[string]>}
 */
async function listDirs(dir) {
    let paths = await fs.readdir(dir);
    return await Promise.all(
        paths.map(async (file) => {
            const filePath = path.join(dir, file);
            const stats = await fs.stat(filePath);
            if (stats.isDirectory()) return filePath;
        })
    );
}

exports.listDirs = listDirs;

/**
 * Deletes a directory recursively
 * @param dir
 * @returns {Promise<void>}
 */
async function deleteDir(dir) {
    return rimraf(dir);
}

exports.deleteDir = deleteDir;

/**
 * Generate arguments
 * @param {[string]} args
 * @returns {Object}
 */
exports.generateArguments = function (args) {
    const index = args.indexOf("--");
    let parameters = [];

    if (index === -1) return { parameters: parameters };

    let key = undefined;
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
};
