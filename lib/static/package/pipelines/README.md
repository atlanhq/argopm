## Pipelines

> The yaml files in this directory are installed as pipelines on the [numaflow](https://numaflow.numaproj.io/) instance in the cluster.

### Sample Pipeline

```yaml
apiVersion: numaflow.numaproj.io/v1alpha1
kind: Pipeline
metadata:
  labels:
    numaflow.numaproj.io/component: pipeline
    numaflow.numaproj.io/part-of: numaflow
  annotations:
    # Modify your pipeline name here
    numaflow.numaproj.io/pipeline-name: 101-hello
    # Modify your vertex name here
    numaflow.numaproj.io/vertex-name: in
    # Modify your pipeline description here
    numaflow.numaproj.io/description: |-
      This is the hello world of pipelines.

      It uses a cron schedule as a source and then just cat the message to a log
    numaflow.numaproj.io/owner: altanhq
    numaflow.numaproj.io/test: 'true'
  # Modify your pipeline name here
  name: 101-hello
  namespace: numaflow-system
spec:
  # Data processing tasks
  vertices:
    # Sources / Inputs
    - name: in
      source:
        generator:
          rpu: 5
          duration: 1s
    # User-defined functions 
    - name: cat
      udf:
        builtin:
          name: cat
      containerTemplate:
        env:
          # This flag will enable debug for `numaflow`, please remove this if it's production 
          - name: NUMAFLOW_DEBUG
            value: "true"
    # Sinks 
    - name: out
      sink:
        log: {}
  # The relationship between the vertices
  edges:
    - from: in
      to: cat
    - from: cat
      to: out
```

### Useful Links

- https://numaflow.numaproj.io/pipeline