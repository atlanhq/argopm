const Promise = require("bluebird");
const fs = Promise.promisifyAll(require("fs"));
const system = require('system-commands');
const utils = require('./utils');


/**
 * Init an Aro package inside the folder
 * Steps:
 * 1. Check if folder is empty
 * 2. Package.json should not be present (unless force is set to true)
 * 3. Copy the static folder in the current directory
 * 4. Change name to the folder name
 * @param {boolean} force
 */
exports.init = function (force) {
    // const dirPath = process.cwd();
    const dirPath = "/tmp/test-package"
    const pathComponents = dirPath.split("/");
    const packageName = pathComponents[pathComponents.length - 1]
    return fs.readdirAsync(dirPath).then(files => {
        if (!force && (files.length !== 0 || files.includes("package.json"))) {
            throw `Files already present in the ${__dirname}. Run this command again with --force to ignore`;
        }

        const staticDirPath = `${__dirname}/static`
        return system(`cp -r ${staticDirPath}/* ${dirPath}`);
    }).then( _ => {
        return utils.walk(dirPath);
    }).then(files => {
        return Promise.each(files, function(file) {
            return replaceInFile(file, "NAME", packageName);
        })
    })
}


function replaceInFile(filePath, searchText, replaceText) {
    const re = new RegExp(searchText,"g");
    return fs.readFileAsync(filePath, 'utf-8').then(data => {
        const result = data.replace(re, replaceText);
        return fs.writeFileAsync(filePath, result, 'utf8');
    })
}