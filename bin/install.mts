#!/usr/bin/env -S npx ts-node --esm
import { bright, cyan, dim, green, yellow } from "ansicolor";
import asTable from "as-table";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { initHelp, installHelp } from "../lib/help.mjs";
import { run, uninstall } from "../lib/index.mjs";
import { init } from "../lib/init.mjs";
import { install, installGlobal } from "../lib/install.mjs";
import { K8sInstallerOptionsType } from "../lib/k8s.mjs";
import { Package } from "../lib/models/package.mjs";
import { constants } from "../lib/constants.mjs";

asTable.configure({
    title: (x) => bright(x),
    delimiter: dim(cyan(" | ")),
    dash: bright(cyan("-")),
});

const yarg = yargs(hideBin(process.argv));

yarg
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
    .command({
        command: "install <package>",
        aliases: ["i"],
        describe: "Install a package. Package name can be of the format package@version",
        builder: (yargs) =>
            yargs
                .option("save", {
                    alias: "s",
                    type: "boolean",
                    description: "Save the package as a dependency in the current project",
                    default: true,
                })
                .option("dry-run", {
                    alias: "d",
                    type: "boolean",
                    description: "Perform an install dry-run and display to-be-installed K8s resources",
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
                .option("exclude-dependencies", {
                    alias: "x",
                    type: "boolean",
                    description: "Exclude dependencies from package.json",
                    demandOption: false,
                    default: false,
                })
                .option("workflow-templates", {
                    alias: "wftmpl",
                    type: "array",
                    description: "Install all (leave empty) or specific workflowtemplates (for local package only)",
                    demandOption: false,
                })
                .option("configmaps", {
                    alias: "cm",
                    type: "array",
                    description: "Install all (leave empty) or specific configmaps (for local package only)",
                    demandOption: false,
                })
                .option("secrets", {
                    alias: "sec",
                    type: "array",
                    description: "Install all (leave empty) or specific secrets (for local package only)",
                    demandOption: false,
                })
                .option("cronworkflows", {
                    alias: "cwf",
                    type: "array",
                    description: "Install all (leave empty) or specific cronworkflows (for local package only)",
                    demandOption: false,
                })
                .option("pipelines", {
                    alias: "pl",
                    type: "array",
                    description: "Install all (leave empty) or specific pipelines (for local package only)",
                    demandOption: false,
                }),
        handler: async (argv) => {
            let packageName: string;
            const {
                global,
                namespace,
                registry,
                cluster,
                excludeDependencies,
                save,
                force,
                cronString,
                timeZone,
                workflowTemplates,
                configmaps,
                secrets,
                cronworkflows,
                pipelines,
            } = argv;
            const options: K8sInstallerOptionsType = { force, cronString, timeZone };
            const installParts: any = {
                [constants.ARGO_WORKFLOW_TEMPLATES_KIND]: workflowTemplates,
                [constants.CONFIGMAP_KIND]: configmaps,
                [constants.SECRET_KIND]: secrets,
                [constants.ARGO_CRON_WORKFLOW_KIND]: cronworkflows,
                [constants.ARGO_DATAFLOW_KIND]: pipelines,
            };

            if (global) {
                packageName = await installGlobal(
                    argv.package as string, // package is a JS reserved word
                    registry,
                    namespace,
                    cluster,
                    excludeDependencies,
                    options,
                    installParts
                );
            } else {
                packageName = await install(
                    argv.package as string,
                    registry,
                    namespace,
                    save,
                    cluster,
                    excludeDependencies,
                    options,
                    installParts
                );
            }

            console.log(installHelp.replace(/NAME/g, packageName));
        },
    })
    .command({
        command: "info <package> [template]",
        describe: "Get info of the installed package or a specific template in the package",
        handler: async (argv) => {
            const argoPackage = await Package.info(
                argv.namespace as string,
                argv.package as string,
                argv.cluster as boolean
            );
            const info = argv.template
                ? argoPackage.templateInfo(argv.template as string)
                : await argoPackage.packageInfo(argv.namespace as string);
            console.log(info);
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
        handler: async (argv) => {
            await run(
                argv.namespace as string,
                argv.package as string,
                argv.template as string,
                argv.serviceAccountName as string,
                argv.imagePullSecrets as string,
                argv.cluster as boolean
            );
            console.log(green(`Package run successful.`));
        },
    })
    .command({
        command: "uninstall <package>",
        aliases: ["u", "r"],
        describe: "Uninstall a package. Uninstalls all dependencies associated with the package.",
        handler: async (argv) => {
            await uninstall(argv.namespace as string, argv.package as string, argv.cluster as boolean);
            console.log(green(`Successfully deleted package ${argv.package}`));
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
                default: false,
            }),
        handler: async (argv) => {
            const packageName = await init(argv.force);
            console.log(initHelp.replace(/NAME/g, packageName));
        },
    })
    .command({
        command: "list",
        aliases: ["l"],
        describe: "List all the packages installed in the namespace",
        handler: async (argv) => {
            const argoPackages = await Package.list(argv.namespace as string, argv.cluster as boolean);
            if (argoPackages.length === 0) {
                console.log(yellow("No packages found"));
            }
            console.log(asTable(argoPackages.map((p) => p.info)));
        },
    })
    // .demandCommand()
    .wrap(yarg.terminalWidth())
    .help().argv;

export default yarg;
