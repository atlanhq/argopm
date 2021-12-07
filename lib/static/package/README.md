# Getting started with argopm - Atlan's Package Manager

This package was bootstrapped using argopm

- Package Name: NAME

## Package Structure

```
.
├── README.md
├── index.js
├── package.json
├── configmaps
│   ├── README.md
│   ├── default-semaphore.yaml
│   └── default.yaml
├── cronworkflows
│   ├── README.md
│   └── default.yaml
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

6 directories, 16 files
```

## Available Commands

- `argopm install`
- `argopm list`
- `argopm run`
- `argopm info`

For more details on these commands run `argom --help`

## Pre-requisites

- To run `argopm install` you must have `kubectl` access to the cluter where Argo is installed
- Files added in the `static` subdirectory are uploaded to the configured S3 artifactory bucket, make sure you have 
  the AWS credentials setup in your shell to upload static files.

## Helpful Documentation

- https://argoproj.github.io/argo-workflows/
- https://www.npmjs.com/package/argopm