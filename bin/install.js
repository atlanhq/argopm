#!/usr/bin/env node
const install = require('../lib/install.js').install;
const {uninstall, info, run, list} = require('../lib/index');
const init = require('../lib/init').init;

const yargs = require('yargs');

const { cyan, dim, bright } = require ('ansicolor')
const asTable = require('as-table').configure({
    title: x => bright(x),
    delimiter: dim(cyan(" | ")),
    dash: bright(cyan("-"))
})


yargs.command({
        command: 'install <package>',
        aliases: ['i'],
        desc: 'Install a package. Package name can be of the format package@version',
        builder: (yargs) => yargs
            .option('save', {
                alias: 's',
                type: 'boolean',
                description: 'Save the package as a dependency in the current project.',
                default: true
            })
            .option('force', {
                alias: 'f',
                type: 'boolean',
                description: 'Force the command',
                default: true
            }),
        handler: (argv) => {
            install(argv.package, argv.registry, argv.namespace, argv.save).then(_ => {
                console.log(`Successfully installed package ${argv.package}`)
            }).catch(error => {
                console.error(error)
            });
        }
    })
    .command({
        command: 'info <package> [template]',
        desc: 'Get info of the installed package or a specific template in the package',
        handler: (argv) => {
            info(argv.namespace, argv.package).then(argoPackage => {
                if (argv.template) {
                    return argoPackage.templateInfo(argv.template)
                }
                return argoPackage.packageInfo();
            }).then(info => {
                console.log(info);
            }).catch(error => {
                console.error(error);
            });
        }
    })
    .command({
        command: 'run <package> [template]',
        desc: 'Run the package or the package template. Pass in arguments using --',
        builder: (yargs) => yargs
            .option('service-account-name', {
                alias: 'san',
                type: 'string',
                description: 'Service Account to run the workflow with.',
                demandOption: true,
            }),
        handler: (argv) => {
            run(argv.namespace, argv.package, argv.template, argv['service-account-name']).then(_ => {
                console.log(`Package run successful`);
            }).catch(error => {
                console.error(error)
            });
        }
    })
    .command({
        command: 'uninstall <package>',
        aliases: ['u', 'r'],
        desc: 'Uninstall a package. Uninstalls all dependencies associated with the package.',
        handler: (argv) => {
            uninstall(argv.namespace, argv.package).then(_ => {
                console.log(`Successfully deleted package ${argv.package}`)
            }).catch(error => {
                console.error(error)
            });
        }
    })
    .command({
        command: 'init',
        desc: 'Initializes an Argo package inside the current working directory',
        builder: (yargs) => yargs
            .option('force', {
                alias: 'f',
                type: 'boolean',
                description: 'Force the command',
                default: true
            }),
        handler: (argv) => {
            init(argv.force).then(_ => {
                console.log(`Successfully initialised package`)
            }).catch(error => {
                console.error(error)
            });
        }
    })
    .command({
        command: 'list',
        aliases: ['l'],
        desc: 'List all the packages installed in the namespace',
        handler: (argv) => {
            list(argv.namespace).then(argoPackages => {
                if (argoPackages.length === 0) {
                    console.log("No packages found");
                    return
                }

                let packageInfos = [];
                argoPackages.forEach(argoPackage => {
                    packageInfos.push(argoPackage.info);
                })
                console.log(asTable(packageInfos));
            }).catch(error => {
                console.error(error)
            });
        }
    })
    .option('namespace', {
        alias: 'n',
        type: 'string',
        description: 'Kubernetes namespace. Packages will be installed in this namespace',
        default: "argo"
    })
    .option('registry', {
        alias: 'r',
        type: 'string',
        description: 'Argo Package Registry',
        default: "https://marketplace.atlan.com"
    })
    .demandCommand()
    .wrap(144)
    .help()
    .argv
