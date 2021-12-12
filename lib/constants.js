'use strict';


class Constants {
    ARGOPM_LIBRARY_NAME_LABEL = "package.argoproj.io/name"
    ARGOPM_LIBRARY_VERSION_LABEL = "package.argoproj.io/version"
    ARGOPM_LIBRARY_PARENT_LABEL = "package.argoproj.io/parent"
    ARGOPM_LIBRARY_REGISTRY_LABEL = "package.argoproj.io/registry"
    ARGOPM_LIBRARY_DESCRIPTION_LABEL = "package.argoproj.io/description"
    ARGOPM_LIBRARY_HOMEPAGE_LABEL = "package.argoproj.io/homepage"
    ARGOPM_LIBRARY_AUTHOR_LABEL = "package.argoproj.io/author"
    ARGOPM_LIBRARY_REPO_LABEL = "package.argoproj.io/repository"
    ARGOPM_LIBRARY_SUPPORT_LABEL = "package.argoproj.io/support"
    ARGOPM_LIBRARY_KEYWORD_LABEL = "package.argoproj.io/keywords"

    ARGOPM_INSTALLER_LABEL = "package.argoproj.io/installer"
    ARGOPM_INSTALLER_LABEL_VALUE = "argopm"

    ARGO_WORKFLOW_TEMPLATES_KIND = "WorkflowTemplate"
    ARGO_CLUSTER_WORKFLOW_TEMPLATES_KIND = "ClusterWorkflowTemplate"
    ARGO_CRON_WORKFLOW_KIND = "CronWorkflow"
    ARGO_DATAFLOW_KIND = "Pipeline"
    CONFIGMAP_KIND = "ConfigMap"
    SECERT_KIND = "Secret"

    // workflow
    ARGO_K8S_API_GROUP = "argoproj.io"
    ARGO_K8S_API_VERSION = "v1alpha1"
    ARGO_WORKFLOW_TEMPLATES_PLURAL = "workflowtemplates"
    ARGO_CLUSTER_WORKFLOW_TEMPLATES_PLURAL = "clusterworkflowtemplates"
    ARGO_WORKFLOWS_PLURAL = "workflows"


    // cronworkflows
    ARGO_CRON_WORKFLOW_PLURAL = "cronworkflows"


    // dataflow
    ARGO_DATAFLOW_K8S_API_GROUP = "dataflow.argoproj.io"
    ARGO_PIPELINES_PLURAL = "pipelines"
}

exports.constants = new Constants();