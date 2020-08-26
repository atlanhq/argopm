#!/usr/bin/env node
var argoInstall = require('../lib/index.js').argoInstall;
const list = require('../lib/index.js').list;

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
      list(argv.namespace).catch(error => {
          console.error(error)
      });
    }
  })
  .example('$0 list -n argo', 'List all installed packages in the namespace')
  .alias('n', 'namespace')
  .nargs('n', 1)
  .describe('n', 'Namespace to install the package')
  .default('n', 'argo')
  .demandCommand()
  .help()
  .wrap(72)
  .argv