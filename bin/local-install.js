const fs = require("fs");
const path = require("path");
const execSync = require("child_process").execSync;

const k8s = require("@kubernetes/client-node");
const { exit } = require("process");

// Kube config
const kc = new k8s.KubeConfig();
kc.loadFromDefault();

function ignoreSafetyCheck(packageName) {
    /**
     * Check if the last safe release was more than 24 hours ago. If not prevent safety check install.
     */
    const safetyCheckFile = `/tmp/atlan-update/${packageName.replace("/", "-")}-last-safe-run.txt`;
    if (!fs.existsSync(safetyCheckFile)) {
        return false;
    }

    const lastSafeRelease = fs.readFileSync(safetyCheckFile, "utf-8");
    const lastSafeReleaseDate = new Date(lastSafeRelease);
    const now = new Date();
    const diff = now - lastSafeReleaseDate;
    const diffInHours = diff / (1000 * 60 * 60);
    if (diffInHours < 24) {
        return false;
    }
    return true;
}

function getAllPackagesMap() {
    /**
     * Returns a map of all packages in the packages directory
     */
    const packagesMap = {};
    console.log("Reading packages from " + marketplacePackagesPath);

    const packages = fs
        .readdirSync(marketplacePackagesPath, { recursive: true, withFileTypes: false })
        .filter((file) => fs.lstatSync(path.join(marketplacePackagesPath, file)).isDirectory());

    for (const packageName of packages) {
        // Skip if packageName contains node_modules
        if (packageName.includes("node_modules")) {
            continue;
        }

        const packagePath = path.join(marketplacePackagesPath, packageName);
        console.log("Reading package " + packageName + " from " + packagePath);

        const packageJSONFileExists = fs.existsSync(path.join(packagePath, "package.json"));

        if (!packageJSONFileExists) {
            continue;
        }

        const packageJSON = JSON.parse(fs.readFileSync(path.join(packagePath, "package.json"), "utf-8"));

        const isNumaflowPackage = fs.existsSync(path.join(packagePath, "pipelines"));

        packagesMap[packageJSON.name] = {
            name: packageJSON.name,
            version: packageJSON.version,
            dependencies: packageJSON.dependencies,
            path: packagePath,
            isNumaflowPackage: isNumaflowPackage,
        };
    }
    console.log("Found " + Object.keys(packagesMap).length + " packages");
    return packagesMap;
}

async function getAllRunningPackages() {
    /**
     * Returns a list of all packages that are currently running
     */

    // Fetch all running workflows
    const workflowClient = kc.makeApiClient(k8s.CustomObjectsApi);
    const workflows = await workflowClient.listNamespacedCustomObject(
        "argoproj.io",
        "v1alpha1",
        "default",
        "workflows",
        undefined,
        undefined,
        undefined,
        undefined,
        "workflows.argoproj.io/phase=Running"
    );

    // For every running workflow, check which package it belongs to
    const runningPackages = [];
    for (const workflow of workflows.body.items) {
        const package = workflow.metadata.annotations["package.argoproj.io/name"];
        if (package) {
            runningPackages.push(package);
        }
    }
    return runningPackages;
}

async function getInstalledPackages() {
    /**
     * Returns a list of all packages that are currently installed on the cluster
     */
    const clusterWorkflowTemplateClient = kc.makeApiClient(k8s.CustomObjectsApi);
    const clusterWorkflowTemplates = await clusterWorkflowTemplateClient.listClusterCustomObject(
        "argoproj.io",
        "v1alpha1",
        "clusterworkflowtemplates"
    );
    const installedPackages = {};
    for (const clusterWorkflowTemplate of clusterWorkflowTemplates.body.items) {
        const package = clusterWorkflowTemplate.metadata.annotations["package.argoproj.io/name"];
        const packageVersion = clusterWorkflowTemplate.metadata.labels["package.argoproj.io/version"];
        if (package && packageVersion) {
            installedPackages[package] = packageVersion;
        }
    }
    console.log("Installed packages: " + Object.keys(installedPackages).join(", "));
    return installedPackages;
}

function getPackagesToInstall(packageName, packagesMap, installedPackages, skipVersionCheck) {
    /**
     * Returns a list of all packages that need to be installed
     */
    var packagesToInstall = new Set();
    const package = packagesMap[packageName];
    if (!package) {
        throw new Error(`Package ${packageName} not found`);
    }

    for (const dependency of Object.keys(package.dependencies)) {
        const dependencyPackage = packagesMap[dependency];
        if (!dependencyPackage) {
            throw new Error(`Dependency ${dependency} not found`);
        }

        if (!installedPackages[dependencyPackage.name]) {
            if (skipVersionCheck || installedPackages[dependencyPackage.name] !== dependencyPackage.version) {
                packagesToInstall.add(dependencyPackage);
            }
        }

        if (dependencyPackage.dependencies) {
            const dependencyPackagesToInstall = getPackagesToInstall(dependency, packagesMap, installedPackages);
            packagesToInstall = new Set([...packagesToInstall, ...dependencyPackagesToInstall]);
        }
    }
    return packagesToInstall;
}

function installPackages(packages, extraArgs, azureArtifacts) {
    // Install packages
    for (const pkg of packages) {
        console.log(`Installing package ${pkg.name}@${pkg.version}`);

        // Change package.json file to remove all dependencies and write back
        const packageJSONPath = path.join(pkg.path, "package.json");
        const packageJSON = JSON.parse(fs.readFileSync(packageJSONPath, "utf-8"));
        packageJSON.dependencies = {};

        // Write back package.json
        fs.writeFileSync(packageJSONPath, JSON.stringify(packageJSON, null, 2));

        // Install package
        execSync("cd " + pkg.path + " && argopm install " + extraArgs + " . " + "--azure " + azureArtifacts);
    }
}

async function run(packageName, azureArtifacts, extraArgs, channel) {
    const packagesMap = getAllPackagesMap();
    const installedPackages = await getInstalledPackages();

    var skipVersionCheck = false;
    if (channel == "master") {
        skipVersionCheck = true;
    }

    const packagesToInstall = getPackagesToInstall(packageName, packagesMap, installedPackages, skipVersionCheck);
    console.log(
        "Packages to install: " +
            Array.from(packagesToInstall)
                .map((pkg) => pkg.name)
                .join(", ")
    );

    // Always install numaflow packages since delete-pipelines may have deleted them
    const numaflowPackages = Object.values(packagesMap).filter((pkg) => pkg.isNumaflowPackage);
    console.log("Numaflow packages to install: " + numaflowPackages.map((pkg) => pkg.name).join(", "));

    installPackages(numaflowPackages, extraArgs, azureArtifacts);

    var safeToInstall = true;
    if (!ignoreSafetyCheck(packageName) && channel == "master") {
        // Check if running workflows have packages that need to be installed
        const runningPackages = await getAllRunningPackages();
        console.log("Running packages: " + runningPackages.join(", "));
        const packagesToInstallNames = Array.from(packagesToInstall).map((pkg) => pkg.name);
        for (const runningPackage of runningPackages) {
            if (packagesToInstallNames.includes(runningPackage)) {
                safeToInstall = false;
                break;
            }
        }
    }
    console.log("Safe to install: " + safeToInstall);

    if (!safeToInstall) {
        console.warn("Not safe to install. Waiting for running workflows to complete before installing packages.");
        exit(1);
    }

    // Install packages
    const argoPackages = [...packagesToInstall].filter((pkg) => !pkg.isNumaflowPackage);
    console.log("Argo packages to install: " + argoPackages.map((pkg) => pkg.name).join(", "));

    installPackages(argoPackages, extraArgs, azureArtifacts);

    // Write last safe release
    fs.writeFileSync(
        `/tmp/atlan-update/${packageName.replace("/", "-")}-last-safe-run.txt`,
        `${Math.floor(new Date().getTime())}`
    );
}

// Take package name as input
const marketplacePackagesPath = process.argv[2];
const packageName = process.argv[3];
const azureArtifacts = process.argv[4];
const extraArgs = process.argv[5];
const channel = process.argv[6];

run(packageName, azureArtifacts, extraArgs, channel);
