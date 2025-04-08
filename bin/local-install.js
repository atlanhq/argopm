const fs = require("fs");
const path = require("path");
const execSync = require("child_process").execSync;
const { getPackagesToInstall, getInstalledPackages, getAllPackagesMap } = require("../lib/local-install-util");

//  New helper function to handle writing to file
function writeInstalledPackagesToFile(installedNames, outputPath) {
    if (!outputPath || installedNames.length === 0) return;

    try {
        const outDir = path.dirname(outputPath);
        fs.mkdirSync(outDir, { recursive: true });

        let existingContent = "";
        try {
            existingContent = fs.readFileSync(outputPath, "utf-8").trim();
        } catch (err) {
            // File doesn't exist yet, that's ok
        }

        const separator = existingContent ? "," : "";
        fs.writeFileSync(
            outputPath,
            `${existingContent}${separator}${installedNames.join(",")}${
                existingContent ? "" : "\n"
            }`
        );
        console.log(`Installed package list written to ${outputPath}`);
    } catch (e) {
        console.error(`Error writing installed packages to ${outputPath}:`, e);
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


async function run(
    marketplacePackagesPath,
    packageName,
    azureArtifacts,
    extraArgs,
    channel,
    snapshotInstall,
    skipVersionCheck,
    skipPackages,
    outputPath
) {
    const packagesMap = getAllPackagesMap(marketplacePackagesPath);
    const installedPackages = await getInstalledPackages();

    const initPackagesToInstall = getPackagesToInstall(
        packageName,
        packagesMap,
        installedPackages,
        skipVersionCheck,
        snapshotInstall
    );

    const skipPackagesArray = Array.from(
        JSON.parse(skipPackages)
            .map((item) => item.split(","))
            .flat()
    );

    const packagesToInstall = Array.from(initPackagesToInstall).filter(
        (item) => !skipPackagesArray.includes(item.name)
    );

    console.log("Packages skipped install: " + skipPackagesArray);
    console.log(
        "Packages to install: " +
            Array.from(packagesToInstall)
                .map((pkg) => pkg.name)
                .join(", ")
    );
    // Always install numaflow packages since delete-pipelines may have deleted them
    const numaflowPackages = [...packagesToInstall].filter((pkg) => pkg.isNumaflowPackage);
    if (packageName != "@atlan/cloud-packages") {
        console.log("Numaflow packages to install: " + numaflowPackages.map((pkg) => pkg.name).join(", "));
        const installed = installPackages(
            numaflowPackages,
            extraArgs,
            azureArtifacts
        );
        writeInstalledPackagesToFile(installed, outputPath);
    }

    const argoPackages = [...packagesToInstall].filter((pkg) => !pkg.isNumaflowPackage);
    console.log("Argo packages to install: " + argoPackages.map((pkg) => pkg.name).join(", "));

    const installed = installPackages(argoPackages,extraArgs,azureArtifacts);
    writeInstalledPackagesToFile(installed, outputPath);

    const filePath = `/tmp/atlan-update/${packageName.replace("/", "-")}-last-safe-run.txt`;
    const dirPath = path.dirname(filePath);
    fs.mkdirSync(dirPath, { recursive: true });
    fs.writeFileSync(filePath, `${Math.floor(new Date().getTime())}`);
}

// Take package name as input
const marketplacePackagesPath = process.argv[2];
const packageName = process.argv[3];
const azureArtifacts = process.argv[4];
const extraArgs = process.argv[5];
const channel = process.argv[6];
// snapshotInstall install package regardless of package version
// It adds a -snapshot suffix to the version
const snapshotInstallString = process.argv[7];
const skipVersionCheckString = process.argv[8];
const skipPackagesString = process.argv[9];
const outputPath = process.argv[10] || ""; // Optional output path for installed package list

const snapshotInstall = snapshotInstallString === "true";
const skipVersionCheck = skipVersionCheckString === "true";
const skipPackages = skipPackagesString.startsWith("[") ? skipPackagesString : "[]";

run(
    marketplacePackagesPath,
    packageName,
    azureArtifacts,
    extraArgs,
    channel,
    snapshotInstall,
    skipVersionCheck,
    skipPackages,
    outputPath
);