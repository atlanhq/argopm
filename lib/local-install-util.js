const fs = require("fs");
const path = require("path");
const k8s = require("@kubernetes/client-node");

// Kube config
const kc = new k8s.KubeConfig();
kc.loadFromDefault();

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
        if (!clusterWorkflowTemplate.metadata.annotations || !clusterWorkflowTemplate.metadata.labels) {
            continue;
        }
        const package = clusterWorkflowTemplate.metadata.annotations["package.argoproj.io/name"];
        const packageVersion = clusterWorkflowTemplate.metadata.labels["package.argoproj.io/version"];
        if (package && packageVersion) {
            installedPackages[package] = packageVersion;
        }
    }
    console.log("Installed packages: " + Object.keys(installedPackages).join(", "));
    return installedPackages;
}

function getPackagesToInstall(packageName, packagesMap, installedPackages, skipVersionCheck, snapshotInstall) {
    /**
     * Returns a list of all packages that need to be installed
     */
    var packagesToInstall = new Set();
    const package = packagesMap[packageName];
    if (!package) {
        throw new Error(`Package ${packageName} not found`);
    }

    const snapshotInstallSuffix = "-snapshot";

    // Check if dependencies exist before processing
    if (package.dependencies && Object.keys(package.dependencies).length > 0) {
        for (const dependency of Object.keys(package.dependencies)) {
            let dependencyPackage = packagesMap[dependency];
            if (!dependencyPackage) {
                throw new Error(`Dependency ${dependency} not found`);
            }

            if (snapshotInstall) {
                if (!dependencyPackage.version.endsWith(snapshotInstallSuffix)) {
                    dependencyPackage.version = dependencyPackage.version + snapshotInstallSuffix;
                }
                packagesToInstall.add(dependencyPackage);
            }

            if (!installedPackages[dependencyPackage.name] || dependencyPackage.isNumaflowPackage) {
                packagesToInstall.add(dependencyPackage);
            }

            if (skipVersionCheck || installedPackages[dependencyPackage.name] !== dependencyPackage.version) {
                packagesToInstall.add(dependencyPackage);
            }

            if (dependencyPackage.dependencies) {
                const dependencyPackagesToInstall = getPackagesToInstall(
                    dependency,
                    packagesMap,
                    installedPackages,
                    skipVersionCheck,
                    snapshotInstall
                );
                packagesToInstall = new Set([...packagesToInstall, ...dependencyPackagesToInstall]);
            }
        }
    }
     
    packagesToInstall.add(package);
    return packagesToInstall;
}

function getAllPackagesMap(marketplacePackagesPath) {
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

function getConnectorPackages(marketplacePackagesPath) {
    //All the connector packages don't have dependency to @atlan/connectors
    //If changes for canary are present in canary deployment, and the crawler is running, then we have to stop installation of @atlan/connectors package
    //Hence if any of these are running, we have to skip the installation of @atlan/connectors package.

    //Read all the packages
    //Check for isVerified, isCertified
    //Check for type miner, utility and return for custom, connectors etc.
    const packages = fs
        .readdirSync(marketplacePackagesPath, { recursive: true, withFileTypes: false })
        .filter((file) => file.endsWith("package.json"))
        .map((file) => JSON.parse(fs.readFileSync(path.join(marketplacePackagesPath, file), "utf-8")))
        .filter((pkg) => pkg.config?.labels?.["orchestration.atlan.com/certified"] === "true")
        .filter(
            (pkg) =>
                pkg.config?.labels?.["orchestration.atlan.com/type"] !== "miner" &&
                pkg.config?.labels?.["orchestration.atlan.com/type"] !== "utility"
        )
        .map((pkg) => pkg.name);

    return packages;
}

exports.getAllRunningPackages = getAllRunningPackages;
exports.getPackagesToInstall = getPackagesToInstall;
exports.getInstalledPackages = getInstalledPackages;
exports.getAllPackagesMap = getAllPackagesMap;
exports.getConnectorPackages = getConnectorPackages;
