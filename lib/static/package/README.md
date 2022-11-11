# Getting started with argopm - Atlan's Package Manager

This package was bootstrapped using argopm

-   Package Name: NAME

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

-   `argopm install`
-   `argopm list`
-   `argopm run`
-   `argopm info`

For more details on these commands run `argopm --help`

## Pre-requisites

-   To run `argopm install` you must have `kubectl` access to the cluter where Argo is installed
-   Files added in the `static` subdirectory are uploaded to the configured S3 artifactory bucket, make sure you have
    the AWS credentials setup in your shell to upload static files.

## Grafana Dashboards

Argopm supports declaring and uploading grafana dashboards as a part of the package. Files available in `dashboards/grafana/` will be uploaded to
a specified Grafana instance.

Declare the following environment variables if you want to upload dashboards to grafana. You can put these in the `.env` file too for
local development.

-   `GRAFANA_URL` - URL of the grafana instance
-   `GRAFANA_API_TOKEN` - Grafana API Token

A post request is sent to `GRAFANA_URL` with the JSON file content in `dashboards/grafana` and `GRAFANA_API_TOKEN` is sent in the `Authorization` 
header as a bearer token. Refer to the [Grafana HTTP API Docs](https://grafana.com/docs/grafana/latest/http_api/) for more information.


## Helpful Documentation

-   https://argoproj.github.io/argo-workflows/
-   https://www.npmjs.com/package/argopm