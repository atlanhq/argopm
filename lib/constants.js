'use strict';


class Constants {
    ARGOPM_LIBRARY_NAME_LABEL = "org.argopm.package.name"
    ARGOPM_LIBRARY_VERSION_LABEL = "org.argopm.package.version"
    ARGOPM_LIBRARY_PARENT_LABEL = "org.argopm.package.parent"
    ARGOPM_LIBRARY_REGISTRY_LABEL = "org.argopm.package.registry"

    ARGOPM_INSTALLER_LABEL = "org.argopm.package.installer"
    ARGOPM_INSTALLER_LABEL_VALUE = "argopm"

    ARGO_K8S_API_GROUP = "argoproj.io"
    ARGO_K8S_API_VERSION = "v1alpha1"
    ARGO_WORKFLOW_TEMPLATES_PLURAL = "workflowtemplates"
    ARGO_WORKFLOWS_PLURAL = "workflows"
}

exports.constants = new Constants();