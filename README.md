# argopm - A package manager for Argo

This is an Argo package manager that helps you find, install and publish packages to your Argo cluster.

![npm-publish-status](https://github.com/atlanhq/argopm/actions/workflows/npm-publish.yml/badge.svg)
### Requirements

1. Node.js `v16.9.0`

Please ensure you have `kubectl` access to the Kubernetes cluster where Argo is deployed and the AWS credentials for writing files to AWS S3.

### Installation

```bash
npm i -g argopm
```

### Usage

```bash 
$ argopm --help
argopm <command>

Commands:
  argopm install <package>          Install a package. Package name can be of the format package@version                        [aliases: i]
  argopm info <package> [template]  Get info of the installed package or a specific template in the package
  argopm run <package> [template]   Run the package or the package template. Pass in arguments using --
  argopm uninstall <package>        Uninstall a package. Uninstalls all dependencies associated with the package.            [aliases: u, r]
  argopm init                       Initializes an Argo package inside the current working directory
  argopm list                       List all the packages installed in the namespace                                            [aliases: l]

Options:
  --version        Show version number                                                                                                 [boolean]
  --namespace, -n  Kubernetes namespace. Packages will be installed in this namespace                                 [string] [default: "argo"]
  --registry, -r   Argo Package Registry                                                     [string] [default: "https://marketplace.atlan.com"]
  --pipeline, -p   Enable Argo Pipeline type                                                                          [boolean] [default: false]
  --cluster, -c    Install the template at cluster level                                                              [boolean] [default: false]
  --help           Show help                                                                                                           [boolean]
```

### Package Structure

This is the structure of a new package created with `argopm`. The 

```bash
.
├── README.md 
├── index.js
├── package.json
├── configmaps # configmaps to be installed in the k8s cluster
│   ├── package-config.yaml
│   └── semaphore-config.yaml
├── cronworkflows # Cron Workflows to be installed on Argo
│   └── package-cronworkflow.yaml
├── pipelines # Argo Dataflow pipelines to be installed
│   └── package-pipeline.yaml
├── secrets # Secrets to be created in the k8s cluster
│   └── package-secret.yaml
├── static # Static data to be uploaded on S3
│   └── data.json
└── templates # Workflow templates to be installed on Argo
    └── package-template.yaml

6 directories, 10 files
```

### Static Files

Everything present in the `static` subdirectory of a package will be uploaded to AWS S3 with the following location prefix :

```
<bucket-name>/argo-artifacts/argopm/<package-name>/<version>/static/
```

### Salient Features:
1. Built as a `npm` package
2. Works on marketplace built on [verdaccio](https://verdaccio.org). Verdaccio is an open-source _npm-like_ marketplace
3. Uses the K8s Custom resources to install packages into your Argo cluster
4. Support for uploading static files to the artifactory (available for AWS S3)
5. Manages versions and installed packages using K8s labels on Argo workflow templates