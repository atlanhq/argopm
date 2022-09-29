#!/usr/bin/env node
import { install, installGlobal } from "../lib/install";
import { initHelp, installHelp } from "../lib/help";
import { uninstall, run } from "../lib/index";
import { init } from "../lib/init";
import { command as yargsCommand } from "yargs";
import { cyan, dim, bright } from "ansicolor";
import { Package } from "../lib/models/package";
import asTableLib = require("as-table");

const asTable = asTableLib.configure({
    title: (x) => bright(x),
    delimiter: dim(cyan(" | ")),
    dash: bright(cyan("-")),
});

yargsCommand({
    command: "install <package>",
    aliases: ["i"],
    describe: "Install a package. Package name can be of the format package@version",
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
            }),
    handler: async (argv) => {
        let packageName;
        const options = {
            force: argv["f"],
            cronString: argv["cs"],
            timeZone: argv["tz"],
        };
        if (argv.global) {
            packageName = await installGlobal(
                argv.package as string,
                argv.registry as string,
                argv.namespace as string,
                argv.cluster as boolean,
                options
            );
        } else {
            packageName = await install(
                argv.package as string,
                argv.registry as string,
                argv.namespace as string,
                argv.save,
                argv.cluster as boolean,
                options
            );
        }

        const re = new RegExp("NAME", "g");
        if (packageName) {
            console.log(installHelp.replace(re, packageName));
        } else {
            console.error(`No packageName on ${installHelp}.`);
        }
    },
})
    .command({
        command: "info <package> [template]",
        describe: "Get info of the installed package or a specific template in the package",
        handler: (argv) => {
            Package.info(argv.namespace as string, argv.package as string, argv.cluster as boolean)
                .then((argoPackage: { templateInfo }) => {
                    if (argv.template) {
                        return argoPackage.templateInfo(argv.template);
                    }
                    return argoPackage.packageInfo(argv.namespace);
                })
                .then((info: any) => {
                    console.log(info);
                });
        },
    })
    .command({
        command: "run <package> [template]",
        describe: "Run the package or the package template. Pass in arguments using --",
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
            run(
                argv.namespace as string,
                argv.package as string,
                argv.template as string,
                argv["san"] as string,
                argv["ips"] as string,
                argv.cluster as boolean
            ).then((_: any) => {
                console.log(`Package run successful`);
            });
        },
    })
    .command({
        command: "uninstall <package>",
        aliases: ["u", "r"],
        describe: "Uninstall a package. Uninstalls all dependencies associated with the package.",
        handler: (argv) => {
            uninstall(argv.namespace as string, argv.package as string, argv.cluster as string).then((_: any) => {
                console.log(`Successfully deleted package ${argv.package}`);
            });
        },
    })
    .command({
        command: "init [package_name]",
        describe: "Initializes an Argo package inside the current working directory",
        builder: (yargs) =>
            yargs.option("force", {
                alias: "f",
                type: "boolean",
                description: "Force the command",
                default: true,
            }),
        handler: (argv) => {
            init(argv.force, argv.package_name).then((packageName: string) => {
                const re = new RegExp("NAME", "g");
                console.log(initHelp.replace(re, packageName));
            });
        },
    })
    .command({
        command: "list",
        aliases: ["l"],
        describe: "List all the packages installed in the namespace",
        handler: (argv) => {
            Package.list(argv.namespace as string, argv.cluster as boolean).then((argoPackages: any[]) => {
                if (argoPackages.length === 0) {
                    console.log("No packages found");
                    return;
                }

                const packageInfos: any[] = [];
                argoPackages.forEach(({ info }) => {
                    packageInfos.push(info);
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
