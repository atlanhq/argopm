## ConfigMaps

Yaml files in this directory are standard k8s ConfigMaps that are installed in the cluster when 
this package is installed.

### Sample ConfigMap

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: NAME-config
  labels:
    category: crawler
    source: snowflake
    subCategory: warehouse
data:
  message: string
```


### Sample ConfigMap with a Semaphore

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: NAME-semaphore
data:
  template-throttle: "3"
```

### Useful Links

- https://kubernetes.io/docs/concepts/configuration/configmap/
- https://argoproj.github.io/argo-workflows/fields/#semaphoreref

