const { exit } = require("process");
const fs = require("fs");
const path = require("path");
const execSync = require("child_process").execSync;
const {
    getAllRunningPackages,
    getPackagesToInstall,
    getInstalledPackages,
    getAllPackagesMap,
    getConnectorPackages,
} = require("../lib/local-install-util");

function skipRunningPackagesCheck(packageName) {
    /**
     * Check if the last safe release was more than 24 hours ago. If not prevent safety check install.
     */

    const safetyCheckFile = `/tmp/atlan-update/${packageName.replace("/", "-")}-last-safe-run.txt`;
    if (!fs.existsSync(safetyCheckFile)) {
        return true;
    }

    const lastSafeRelease = parseInt(fs.readFileSync(safetyCheckFile, "utf-8"), 10);
    const lastSafeReleaseDate = new Date(lastSafeRelease);
    const now = new Date();
    const diff = now - lastSafeReleaseDate;
    const diffInHours = diff / (1000 * 60 * 60);
    if (diffInHours < 24) {
        return false;
    }
    return true;
}

async function run(marketplacePackagesPath, packageName, snapshotInstall, skipVersionCheck) {
    if (snapshotInstall) {
        console.log("snapshot install, safe to proceed");
        exit(0);
    }
    const packagesMap = getAllPackagesMap(marketplacePackagesPath);
    const installedPackages = await getInstalledPackages();
    console.log(123);
    const packagesToInstall = getPackagesToInstall(
        packageName,
        packagesMap,
        installedPackages,
        skipVersionCheck,
        snapshotInstall
    );
    var safeToInstall = true;
    if (!skipRunningPackagesCheck(packageName)) {
        // Check if running workflows have packages that need to be installed
        const runningPackages = await getAllRunningPackages();
        console.log("Running packages: " + runningPackages.join(", "));
        const packagesToInstallNames = Array.from(packagesToInstall).map((pkg) => pkg.name);
        const connectorPackages = [...packagesToInstall].find((pkg) => "@atlan/connectors" === pkg.name)
            ? getConnectorPackages(marketplacePackagesPath)
            : [];
        for (const runningPackage of runningPackages) {
            if (packagesToInstallNames.includes(runningPackage)) {
                safeToInstall = false;
                break;
            }
            if (connectorPackages.includes(runningPackage)) {
                //If any of the connector packages are running, then we have to skip the installation of @atlan/connectors package.
                safeToInstall = false;
                console.log(
                    `Connector package ${runningPackage} is running. Skipping installation of @atlan/connectors package`
                );
                break;
            }
        }
    }
    console.log("Safe to install: " + safeToInstall);

    console.log("Installing numaflow pipelines immediately.");

    const numaflowPackages = [...packagesToInstall].filter((pkg) => pkg.isNumaflowPackage);
    
    console.log("Numaflow packages to install: " + numaflowPackages.map((pkg) => pkg.name).join(", "));
    installPackages(
        numaflowPackages,
        extraArgs,
        azureArtifacts
    );
    
    if (!safeToInstall) {
        console.warn("Not safe to install. Waiting for running workflows to complete before installing packages.");
        // use custom exit code 100 to bypass workflow failure
        // choose code 100 to avoid collision https://node.readthedocs.io/en/latest/api/process/
        exit(100);
    }
}

function installPackages(packages, extraArgs, azureArtifacts) {
    const installedNames = []; // Track installed package names

    for (const pkg of packages) {
        console.log(`Installing package ${pkg.name}@${pkg.version}`);

        const packageJSONPath = path.join(pkg.path, "package.json");
        const packageJSON = JSON.parse(
            fs.readFileSync(packageJSONPath, "utf-8")
        );
        packageJSON.dependencies = {};
        packageJSON.version = pkg.version;
        fs.writeFileSync(
            packageJSONPath,
            JSON.stringify(packageJSON, null, 2)
        );

        try {
            execSync(
                `cd ${pkg.path} && argopm install ${extraArgs} . --azure ${azureArtifacts}`
            );
            installedNames.push(pkg.name);
        } catch (e) {
            console.error(`Error installing ${pkg.name}:`, e);
        }
    }

    return installedNames; // Return the installed package names
}

const marketplacePackagesPath = process.argv[2];
const packageName = process.argv[3];
const azureArtifacts = process.argv[4];
const extraArgs = process.argv[5];
const snapshotInstallString = process.argv[6];
const skipVersionCheckString = process.argv[7];
const snapshotInstall = snapshotInstallString === "true";
const skipVersionCheck = skipVersionCheckString === "true";

run(marketplacePackagesPath, packageName, snapshotInstall, skipVersionCheck);
