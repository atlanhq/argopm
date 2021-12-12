'use strict';


class Constants {
    ARGOPM_LIBRARY_NAME_LABEL = "argopm.atlan.com/name"
    ARGOPM_LIBRARY_VERSION_LABEL = "argopm.atlan.com/version"
    ARGOPM_LIBRARY_PARENT_LABEL = "argopm.atlan.com/parent"
    ARGOPM_LIBRARY_REGISTRY_LABEL = "argopm.atlan.com/registry"
    ARGOPM_LIBRARY_DESCRIPTION_LABEL = "argopm.atlan.com/description"
    ARGOPM_LIBRARY_HOMEPAGE_LABEL = "argopm.atlan.com/homepage"
    ARGOPM_LIBRARY_AUTHOR_LABEL = "argopm.atlan.com/author"
    ARGOPM_LIBRARY_REPO_LABEL = "argopm.atlan.com/repository"
    ARGOPM_LIBRARY_SUPPORT_LABEL = "argopm.atlan.com/support"
    ARGOPM_LIBRARY_KEYWORD_LABEL = "argopm.atlan.com/keywords"

    ARGOPM_INSTALLER_LABEL = "argopm.atlan.com/installer"
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