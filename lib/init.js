const Promise = require("bluebird");
const fs = Promise.promisifyAll(require("fs"));
const system = require("system-commands");
const utils = require("./utils");
//const LinearClient = require("@linear/sdk").LinearClient;
//const linearClient = new LinearClient();

/**
 * Init an Argo package inside the folder
 * Steps:
 * 1. Check if folder is empty
 * 2. Package.json should not be present (unless force is set to true)
 * 3. Copy the static folder in the current directory
 * 4. Change name to the folder name
 * @param {boolean} force
 */
exports.init = function (force, inputPackageName) {
    // const dirPath = "/tmp/test-package";
    const dirPath = process.cwd();
    const pathComponents = dirPath.split("/");
    const packageName = inputPackageName != "." || pathComponents[pathComponents.length - 1];
    return fs
        .readdirAsync(dirPath)
        .then((files) => {
            if (!force && (files.length !== 0 || files.includes("package.json"))) {
                throw `Files already present in the ${__dirname}. Run this command again with --force to ignore`;
            }

            const skeletonPackagePath = `${__dirname}/static/package`;
            return system(`cp -r ${skeletonPackagePath}/ ${dirPath}`);
        })
        .then((_) => {
            return utils.walk(dirPath);
        })
        .then((files) => {
            return Promise.each(files, function (file) {
                return replaceInFile(file, "NAME", packageName);
            });
        })
        .then((_) => {
            return packageName;
        });
};

function replaceInFile(filePath, searchText, replaceText) {
    const re = new RegExp(searchText, "g");
    return fs.readFileAsync(filePath, "utf-8").then((data) => {
        const result = data.replace(re, replaceText);
        return fs.writeFileAsync(filePath, result, "utf8");
    });
}

/* Init an connector Argo package inside the folder
 * Steps:
 * 1. Check if folder is empty
 * 2. Package.json should not be present (unless force is set to true)
 * 3. Copy the static folder in the current directory
 * 4. Change name to the folder name
 * @param {boolean} force
 * @param {string} filepath
 */
exports.connectorInit = async function (force, inputPackageName, inputPackageType, auth, assetList, script, linear) {
    const dirPath = "/Users/mrunmayi.tripathi/atlan/code/marketplace-packages/packages/atlan/test-package";
    //const dirPath = process.cwd();
    const pathComponents = dirPath.split("/");
    const packageName = inputPackageName || pathComponents[pathComponents.length - 1];

    if (inputPackageType) {
        var assetListArray = assetList.split(",");
        if (inputPackageType === "BI") {
            await exports.initConnectorBI(force, dirPath, inputPackageName, auth, assetListArray);
        } else if (inputPackageType === "SQL") {
            //await exports.initConnectorSQL(force, dirPath, inputPackageName, assetListArray);
        }

        //Create entry in packages.json
        await createPackageEntry(dirPath, inputPackageName);

        //Create linear
        if (linear) {
            //await createLinearWithSubtask(inputPackageName);
        }
    } else {
        return fs
            .readdirAsync(dirPath)
            .then((files) => {
                if (!force && (files.length !== 0 || files.includes("package.json"))) {
                    throw `Files already present in the ${__dirname}. Run this command again with --force to ignore`;
                }
                var skeletonPackagePath = `${__dirname}/static/package`;
                system(`cp -r ${skeletonPackagePath}/ ${dirPath}/../packages/package.json`);
                return system(`cp -r ${skeletonPackagePath}/ ${dirPath}`);
            })
            .then((_) => {
                return utils.walk(dirPath);
            })
            .then((files) => {
                return Promise.each(files, function (file) {
                    return replaceInFile(file, "NAME", packageName);
                });
            })
            .then((_) => {
                return packageName;
            })
            .catch((error) => {
                console.log(error);
            });
    }
};

exports.initConnectorBI = async function (force, dirPath, packageName, auth, assetList) {
    return fs
        .readdirAsync(dirPath)
        .then((files) => {
            if (!force && (files.length !== 0 || files.includes("package.json"))) {
                throw `Files already present in the ${__dirname}. Run this command again with --force to ignore`;
            }
            var skeletonPackagePath = `${__dirname}/connectors/BI`;
            return system(`cp -r ${skeletonPackagePath}/ ${dirPath}`);
        })
        .then((_) => {
            return utils.walk(dirPath);
        })
        .then((files) => {
            return Promise.each(files, function (file) {
                if (assetList.length != 0 && file.includes("/transformers/")) {
                    return BuildTransformerFilesForBI(file, assetList);
                } else if (assetList.length != 0 && file.includes("/templates/")) {
                    return BuildTemplateFiles(packageName, file, auth);
                } else {
                    return replaceInFile(file, "NAME", packageName);
                }
            });
        })
        .then((_) => {
            fs.unlinkSync(`${dirPath}/transformers/default.jinja2`);
            return packageName;
        })
        .catch((error) => {
            console.error(`Error in function initConnectorBI: ${error}`);
            console.log(error);
        });
};

function BuildTransformerFilesForBI(filePath, assetList) {
    return Promise.each(assetList, function (asset) {
        const newFilePath = filePath.replace("default", asset);
        return fs.readFileAsync(filePath, "utf-8").then((data) => {
            data = data.replace("ASSET_NAME", asset);
            fs.writeFile(newFilePath, data, (err) => {
                if (err) throw err;
                console.log("File %s created successfully!", newFilePath);
            });
        });
    });
}

function BuildTemplateFiles(packageName, filePath, auth) {
    var newFilePath = "";

    if (auth.includes("oauth") && filePath.includes("oauth")) {
        newFilePath = filePath;
    } else if (auth.includes("basic") && filePath.includes("basic")) {
        newFilePath = filePath;
    } else if (auth.includes("api") && filePath.includes("api")) {
        newFilePath = filePath;
    }
    if (newFilePath.length) {
        return fs.readFileAsync(filePath, "utf-8").then((data) => {
            data = data.replace("NAME", packageName);
            return fs.writeFile(newFilePath, data, (err) => {
                if (err) throw err;
                console.log("File %s created successfully!", newFilePath);
            });
        });
    } else {
        return;
    }
}
/*
async function createLinearWithSubtask(inputPackageName) {
    const teams = await linearClient.teams();
    let orcTeam = teams.nodes[0];
    teams.nodes.forEach(function (team) {
        if (team.key === "ORC") {
            orcTeam = team;
        }
    });
    const issue = await linearClient.createIssue({ teamId: orcTeam.id, title: `${inputPackageName} Package` });
    console.info("add entry to linear %s", issue);
    return;
}
*/

/*
  Add entry to package.json
  This step requires dirPath from marketplace packages repo inside atlan/ folder
*/
async function createPackageEntry(dirPath, packageName) {
    try {
        const filePath = `${dirPath}/../packages/package.json`;
        const rawPackageData = await fs.readFileAsync(filePath, "utf-8");
        console.info(rawPackageData);
        let packageData = JSON.parse(rawPackageData);
        packageData.dependencies[`@atlan/${packageName}`] = "^1.0.0";
        fs.writeFileAsync(filePath, JSON.stringify(packageData), "utf8");
        console.info("add connector entry to %s", filePath);
    } catch (e) {
        console.log("error", e);
    }
}
