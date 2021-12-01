## Pipelines

The yaml files in this directory are installed as dataflow pipelines on the Argo instance in the cluster.

### Sample Pipeline

```yaml
apiVersion: dataflow.argoproj.io/v1alpha1
kind: Pipeline
metadata:
  annotations:
    dataflow.argoproj.io/description: |-
      This is the hello world of pipelines.

      It uses a cron schedule as a source and then just cat the message to a log
    dataflow.argoproj.io/owner: argoproj-labs
    dataflow.argoproj.io/test: 'true'
  name: 101-hello
  namespace: argo-dataflow-system
spec:
  steps:
  - cat: {}
    name: main
    sinks:
    - log: {}
    sources:
    - cron:
        schedule: '*/3 * * * * *'
```

### Useful Links

- https://github.com/argoproj-labs/argo-dataflow