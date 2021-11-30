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