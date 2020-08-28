'use strict';
const {yellow, blue, bright, cyan} = require('ansicolor');

exports.initHelp = `
Package successfully initialised. Install the current package using
${cyan("argopm install .")}
`

exports.installHelp = `
Package successfully installed.
- ${cyan("List all available packages:")}
  ${yellow("argopm list")}

- ${cyan("Get info on the package installed")}
  ${yellow("argopm info NAME")}

- ${cyan("Get info on the package template")}
  ${yellow("argopm info NAME <templatename>")}

- ${cyan("Run the package by providing a service account name and the required arguments")}
  ${yellow("argopm run NAME --san <serviceaccountname> -- --argument 'argument-value'")}
`