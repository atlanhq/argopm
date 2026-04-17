![npm-publish-status](https://github.com/atlanhq/argopm/actions/workflows/npm-publish.yml/badge.svg)

# argopm

`argopm` is a package manager for [Argo Workflows](https://argoproj.github.io/argo-workflows/). It enables developers to
distribute and consume argo workflow templates as reusable modules.

Usually, these templates are declared in multiple YAML files and have to be manually applied to the cluster when making
changes, doing this becomes very tedious with a growing number of templates.

That's why we built `argopm`. It allows you to bundle your workflow templates as npm packages so you can distribute and
consume them using the amazing tooling already present in the Javascript ecosystem.

With `argopm` you can also add other k8s resources like configmaps, secrets etc to your package. It also supports adding
grafana dashboards right into your package. There is also support for uploading static files to the artifactory (
available for AWS S3)

## Getting Started

### Prerequisites

-   Node.js `> v18.20.3`

### Installation

`argopm` is available on [NPM](https://www.npmjs.com/package/argopm). You can install it globally in your node
environment using `npm` or `yarn`.

```bash
npm i -g argopm
```

OR

```bash
yarn add -g argopm
```

### Quickstart

To create a new package with `argopm`, create a directory for your package, `cd` into that directory and
run `argopm init .` to scaffold a default package.

```bash
mkdir sample-package && cd sample-package
argopm init .
```

Once this succeeds, you'll see the following contents in your package

```bash
.
├── README.md
├── configmaps
│   ├── README.md
│   └── default.yaml
├── cronworkflows
│   ├── README.md
│   └── default.yaml
├── dashboards
│   └── grafana
│       └── observability.json
├── index.js
├── package.json
├── pipelines
│   ├── README.md
│   └── default.yaml
├── secrets
│   ├── README.md
│   └── default.yaml
├── static
│   ├── README.md
│   └── data.json
└── templates
    ├── README.md
    └── default.yaml

8 directories, 16 files
```

You can then run `argopm install .` to install this package to the kubernetes cluster your current context is set to.

## Usage

You can use the `--help` flag to get info about various commands.

```
argopm <command>

Commands:
  argopm install <package>          Install a package. Package name can be of the format package@version                            [aliases: i]
  argopm info <package> [template]  Get info of the installed package or a specific template in the package
  argopm run <package> [template]   Run the package or the package template. Pass in arguments using --
  argopm uninstall <package>        Uninstall a package. Uninstalls all dependencies associated with the package.                [aliases: u, r]
  argopm init [package_name]        Initializes an Argo package inside the current working directory
  argopm list                       List all the packages installed in the namespace                                                [aliases: l]

Options:
      --version    Show version number                                                                                                 [boolean]
  -n, --namespace  Kubernetes namespace. Packages will be installed in this namespace                                 [string] [default: "argo"]
  -r, --registry   Deprecated no-op. Retained for backward compatibility. argopm only performs local installs.    [string] [default: ""]
  -c, --cluster    Install the template at cluster level                                                              [boolean] [default: false]
      --help       Show help                                                                                                           [boolean]
```

## Contributing

Refer to [CONTRIBUTING.md](/CONTRIBUTING.md) for more information on contributing code, docs and tests to `argopm`.

## License

The project is licensed under the MIT License, see the [LICENSE](LICENSE) file for details.

## Discussion and Support

-   Q&A: [Github Discussions](https://github.com/atlanhq/argopm/discussions)
-   You can also reach out to engineering@atlan.com

