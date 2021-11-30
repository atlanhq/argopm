## CRON Workflows

The yaml files in this directory are installed as Cron Workflow Templates on the Argo instance in the cluster.

### Sample Cron Workflow

```yaml
apiVersion: argoproj.io/v1alpha1
kind: CronWorkflow
metadata:
  name: NAME-cron-workflow
spec:
  schedule: "* * * * *"
  timezone: "America/Los_Angeles"   # Default to local machine timezone
  startingDeadlineSeconds: 0
  concurrencyPolicy: "Replace"      # Default to "Allow"
  successfulJobsHistoryLimit: 4     # Default 3
  failedJobsHistoryLimit: 4         # Default 1
  suspend: true                    # Set to "true" to suspend scheduling
  workflowSpec:
    workflowTemplateRef:
      name: NAME
```

### Useful Links

- https://argoproj.github.io/argo-workflows/cron-workflows/