## Workflow Template

The yaml files in this directory are installed as Workflow Templates on the Argo instance in the cluster.

### Sample Workflow Template

```yaml
apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
metadata:
  name: NAME
spec:
  entrypoint: whalesay-template
  metrics:
    prometheus:
      - name: exec_duration_gauge         # Metric name (will be prepended with "argo_workflows_")
        labels:                           # Labels are optional. Avoid cardinality explosion.
          - key: name
            value: sample_name
        help: "Duration gauge by name"    # A help doc describing your metric. This is required.
        gauge:                            # The metric type. Available are "gauge", "histogram", and "counter".
          value: "{{workflow.duration}}"  # The value of your metric. It could be an Argo variable (see variables doc) or a literal value
  arguments:
    parameters:
      - name: message
        value: hello world
  templates:
    - name: whalesay-template
      inputs:
        parameters:
          - name: message
      container:
        image: docker/whalesay
        command: [cowsay]
        args: ["{{inputs.parameters.message}}"]
```

### Useful Links

- https://argoproj.github.io/argo-workflows/