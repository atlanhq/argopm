#!/usr/bin/env node
const { install, installGlobal } = require("../lib/install.js");
const { initHelp, installHelp } = require("../lib/help");
const { uninstall, info, run, list } = require("../lib/index");
const init = require("../lib/init").init;

const yargs = require("yargs");

const { cyan, dim, bright } = require("ansicolor");
const asTable = require("as-table").configure({
    title: (x) => bright(x),
    delimiter: dim(cyan(" | ")),
    dash: bright(cyan("-")),
});

yargs
    .command({
        command: "install <package>",
        aliases: ["i"],
        desc: "Install a package. Package name can be of the format package@version",
        builder: (yargs) =>
            yargs
                .option("save", {
                    alias: "s",
                    type: "boolean",
                    description: "Save the package as a dependency in the current project.",
                    default: true,
                })
                .option("force", {
                    alias: "f",
                    type: "boolean",
                    description: "Force install package ignoring version in cluster",
                    default: false,
                })
                .option("global", {
                    alias: "g",
                    type: "boolean",
                    description: "Install the package globally",
                    default: false,
                })
                .option("cron-string", {
                    alias: "cs",
                    type: "string",
                    description: "Cron String",
                    demandOption: false,
                })
                .option("time-zone", {
                    alias: "tz",
                    type: "string",
                    description: "Time Zone",
                    demandOption: false,
                    default: Intl.DateTimeFormat().resolvedOptions().timeZone,
                })
                .option("preview", {
                    alias: "p",
                    type: "boolean",
                    description:
                        "Print JSON-formatted dependency graph of packages to be installed without actually installing them",
                    default: false,
                })
                .option("export-package-names", {
                    type: "string",
                    description: "export installed packages to a file",
                    default: "",
                })
                .option("azure", {
                    alias: "az",
                    type: "boolean",
                    description: "Replaces s3/key artifacts for azure/blob artifacts in workflow templates",
                    default: false,
                }),
        handler: (argv) => {
            var options = {
                force: argv["f"],
                cronString: argv["cs"],
                timeZone: argv["tz"],
                preview: argv["p"],
                azure: argv["az"],
                exportPackageNameFilePath: argv["export-package-names"],
            };
            if (argv.global) {
                return installGlobal(argv.package, argv.registry, argv.namespace, argv.cluster, options).then(
                    (packageName) => {
                        if (!options.preview) {
                            const re = new RegExp("NAME", "g");
                            console.log(installHelp.replace(re, packageName));
                        }
                    }
                );
            }
            return install(argv.package, argv.registry, argv.namespace, argv.save, argv.cluster, options).then(
                (packageName) => {
                    if (!options.preview) {
                        const re = new RegExp("NAME", "g");
                        console.log(installHelp.replace(re, packageName));
                    }
                }
            );
        },
    })
    .command({
        command: "info <package> [template]",
        desc: "Get info of the installed package or a specific template in the package",
        handler: (argv) => {
            info(argv.namespace, argv.package, argv.cluster)
                .then((argoPackage) => {
                    if (argv.template) {
                        return argoPackage.templateInfo(argv.template);
                    }
                    return argoPackage.packageInfo(argv.namespace);
                })
                .then((info) => {
                    console.log(info);
                });
        },
    })
    .command({
        command: "run <package> [template]",
        desc: "Run the package or the package template. Pass in arguments using --",
        builder: (yargs) =>
            yargs
                .option("service-account-name", {
                    alias: "san",
                    type: "string",
                    description: "Service Account to run the workflow with.",
                    demandOption: false,
                })
                .option("image-pull-secrets", {
                    alias: "ips",
                    type: "string",
                    description: "Image Pull secrets",
                    demandOption: false,
                }),
        handler: (argv) => {
            run(argv.namespace, argv.package, argv.template, argv["san"], argv["ips"], argv.cluster).then((_) => {
                console.log(`Package run successful`);
            });
        },
    })
    .command({
        command: "uninstall <package>",
        aliases: ["u", "r"],
        desc: "Uninstall a package. Uninstalls all dependencies associated with the package.",
        handler: (argv) => {
            uninstall(argv.namespace, argv.package, argv.cluster).then((_) => {
                console.log(`Successfully deleted package ${argv.package}`);
            });
        },
    })
    .command({
        command: "init [package_name]",
        desc: "Initializes an Argo package inside the current working directory",
        builder: (yargs) =>
            yargs.option("force", {
                alias: "f",
                type: "boolean",
                description: "Force the command",
                default: true,
            }),
        handler: (argv) => {
            init(argv.force, argv.package_name).then((packageName) => {
                const re = new RegExp("NAME", "g");
                console.log(initHelp.replace(re, packageName));
            });
        },
    })
    .command({
        command: "list",
        aliases: ["l"],
        desc: "List all the packages installed in the namespace",
        handler: (argv) => {
            list(argv.namespace, argv.cluster).then((argoPackages) => {
                if (argoPackages.length === 0) {
                    console.log("No packages found");
                    return;
                }

                let packageInfos = [];
                argoPackages.forEach((argoPackage) => {
                    packageInfos.push(argoPackage.info);
                });
                console.log(asTable(packageInfos));
            });
        },
    })
    .option("namespace", {
        alias: "n",
        type: "string",
        description: "Kubernetes namespace. Packages will be installed in this namespace",
        default: "argo",
    })
    .option("registry", {
        alias: "r",
        type: "string",
        description: "Argo Package Registry",
        default: "https://packages.atlan.com",
    })
    .option("cluster", {
        alias: "c",
        type: "boolean",
        description: "Install the template at cluster level",
        default: false,
    })
    .demandCommand()
    .wrap(144)
    .help().argv;
