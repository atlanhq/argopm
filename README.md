# argopm(1) -- an Argo package manager

This is an Argo package manager that helps you find, install and publish packages to your Argo cluster.

### Salient Features:
1. Built as a `npm` package
2. Works on marketplace built on [verdaccio](https://verdaccio.org). Verdaccio is an open-source __npm_like__ marketplace.
3. Uses the K8s Custom resources to install packages into your Argo cluster
4. Manages versions and installed packages using K8s labels on Argo workflow templates
