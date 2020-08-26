#!/usr/bin/env node
var argoInstall = require('../lib/index.js').argoInstall;
const listInstalledPackages = require('../lib/index.js').listInstalledPackages;
const info = require('../lib/index').info;
const deletePackage = require('../lib/index').deletePackage;
const { cyan, dim, bright } = require ('ansicolor')
const asTable = require('as-table').configure({
    title: x => bright(x),
    delimiter: dim(cyan(" | ")),
    dash: bright(cyan("-"))
})

require('yargs')
    .command({
        command: 'install <package>',
        aliases: ['i'],
        desc: 'Install an Argo package',
        handler: (argv) => {
            argoInstall(argv.package, argv.namespace, argv.registry).then(_ => {
                console.log(`Successfully installed package ${argv.package}`)
            }).catch(error => {
                console.error(error)
            });
        }
    })
    .example('$0 install <package>@version -n argo -r https://marketplace.atlan.com', 'Installs the package from the specified registry in the procided namespace')
    .alias('n', 'namespace')
    .nargs('n', 1)
    .describe('n', 'Namespace to install the package')
    .default('n', 'argo')
    .alias('r', 'registry')
    .nargs('r', 1)
    .describe('r', 'Specify the Argo Package Registry')
    .default('r', 'https://marketplace.atlan.com')
    .command({
        command: 'list',
        aliases: ['l'],
        desc: 'List all installed packages',
        handler: (argv) => {
            listInstalledPackages(argv.namespace).then(argoPackages => {
                if (argoPackages.length === 0) {
                    console.log("No Argo packages installed");
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
    .command({
        command: 'delete <package>',
        aliases: ['d', 'del'],
        desc: 'Delete an Argo package',
        handler: (argv) => {
            deletePackage(argv.namespace, argv.package).then(_ => {
                console.log(`Successfully deleted package ${argv.package}`)
            }).catch(error => {
                console.error(error)
            });
        }
    })
    .demandCommand()
    .help()
    .argv