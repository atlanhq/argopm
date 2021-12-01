## Secrets

Yaml files in this directory are standard k8s Secrets that are installed in the cluster when 
this package is installed.

### Sample Secret

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: NAME-secret
type: Opaque
stringData:
  authType: basic
  connType: conn
  driver: driver
  driverProperties: prop
  extra: extra
  jar: jar
  login: username
  password: pass
  url: url
```

### Useful Links

- https://kubernetes.io/docs/concepts/configuration/secret/