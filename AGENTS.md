# AGENTS.md — Atlan AI Agent Guidelines

> **Version:** 4.2
> **Last Updated:** 2026-03-15
> **Applies To:** All AI agents (Claude, GPT, Copilot, Cursor, Cline, etc.) working on Atlan argopm codebase
> **Companion File:** See `CLAUDE.md` for the lean version optimized for Claude Code.

**All AI agents must follow these guidelines when generating, modifying, or reviewing code in Atlan repositories.**

---

## Security

### Owners & Contact
- **Security Team:** For questions, concerns, or proposed changes to `AGENTS.md` / `CLAUDE.md`, reach out to the **Atlan Security Team** (on Slack #collab-platform-security).
- **Manual Security Review:** If your changes are risky or touch critical security surfaces (auth flows, multi-tenant isolation, secrets management, new external integrations, new API endpoints), **request a manual security review** from the Security team before merging.

---

### Repo-Specific Security: argopm

This Node.js CLI for Argo Workflows interacts with K8s APIs and uploads artifacts to AWS S3. Core security concerns: K8s secret exposure, S3 bucket config validation, untrusted YAML deserialization, file path traversal.

#### ❌ Anti-Patterns (Don't Do This)

```javascript
// ❌ Logging secret values directly
secrets.forEach((secret) => {
    console.log(`Secret: ${secret.metadata.name} = ${secret.data.password}`);
});

// ❌ Accepting S3 bucket as CLI argument
const bucket = process.argv[2];  // Untrusted user input
const params = { Bucket: bucket, Key: key, Body: content };

// ❌ Deserializing untrusted YAML
const userConfig = yaml.load(req.body.config);  // User-provided YAML

// ❌ Path traversal in file uploads
const filePath = req.body.path;  // No validation
fs.readFileSync(filePath);
```

#### ✅ Correct Patterns (Do This)

```javascript
// ✅ Log only metadata, never secret values
secrets.forEach((secret) => {
    console.log(`- ${secret.metadata.name}`);  // Name only
});

// ✅ S3 bucket config from K8s ConfigMap only
const kc = new k8s.KubeConfig();
kc.loadFromDefault();
const api = kc.makeApiClient(k8s.CoreV1Api);
const configMap = await api.readNamespacedConfigMap({ name, namespace });
const bucket = yaml.load(configMap.data.bucket);  // From K8s, trusted source

// ✅ Validate file paths against allowed directory
const allowedDir = path.resolve('/app/static');
const fullPath = path.resolve(userPath);
if (!fullPath.startsWith(allowedDir)) {
    throw new Error('Path traversal blocked');
}

// ✅ Generic error messages to CLI, details in logs
try {
    await api.readNamespacedConfigMap({ name, namespace });
} catch (err) {
    logger.error(`K8s API failed: ${err}`);  // Server-side log
    console.log('Failed to fetch configuration');  // Generic to user
}
```

#### Key Guidelines

1. **[MUST] Never Log K8s Secrets:** Only display `secret.metadata.name`, never `secret.data` or secret values. Only reference secret names in output.

2. **[MUST] S3 Bucket from K8s ConfigMap Only:** Load `bucket` and `region` from K8s ConfigMap (trusted source). Never accept as CLI args or env vars. Always load via K8s API call and validate success.

3. **[MUST] Validate S3 Key Prefix:** The S3 key prefix must use only trusted package metadata from K8s. Never include untrusted user input (CLI args, request params) in the key.

4. **[MUST] Generic K8s API Errors:** When K8s API calls fail, log full error server-side but return generic message to CLI. Never expose K8s error messages, namespace names, or resource details.

5. **[REDLINE] YAML Deserialization:** Only deserialize YAML from K8s ConfigMap (trusted). Never call `yaml.load()` on user-provided input, CLI args, or request bodies.

6. **[MUST] File Upload Path Validation:** Validate all file paths are within allowed `static/` directory. Use `path.resolve()` + `startsWith()` to prevent path traversal attacks (`../../sensitive`).

7. **[SHOULD] S3 Client Lifecycle:** Initialize S3Client once, reuse across uploads, properly destroy on process exit to avoid connection leaks.

8. **[SHOULD] K8s RBAC Scoping:** KubeConfig is loaded globally. Ensure K8s service account has minimal RBAC permissions (only read ConfigMaps, list Secrets for display, not write).

---

### Security Invariants (Always Apply)

- **[MUST] No secrets in code or logs**
- **[MUST] Multi-tenant isolation:** `tenant_id` from auth context only
- **[MUST] Parameterize data access:** never concatenate user input into queries/filters
- **[MUST] Auth & authz must be real:** no phantom auth
- **[MUST] No wildcards:** no `CORS: *`, no IAM `Action:"*"`, no K8s RBAC `resources:["*"]`
- **[MUST] Don't execute untrusted input:** no `eval`, no unsafe deserialization, no command injection
- **[MUST] Pin supply chain:** actions→SHA, images→version/SHA, no `latest`
- **[MUST] Safe errors:** generic to clients; internal details server-side only
- **[MUST] Log safely:** never log tokens, cookies, secrets
- **[MUST] Validate outbound URLs (SSRF):** allowlist all outbound URLs; deny internal/private IP ranges
- **[MUST] Rate limit abuse-prone endpoints:** auth, password reset, token generation
- **[MUST] New API endpoints must ship secure:** auth, authz, input validation, rate limiting before merge
- **[MUST] No `.env` files with real secrets in version control**
- **[MUST] All code in approved GitHub organizations** (e.g., AtlanHQ)

---

### Backend & Server Code, CI/CD, Dependencies, etc.

See **CLAUDE.md** for complete coverage of:
- Backend & Server Code
- Helm Charts & Kubernetes Manifests
- CI/CD & GitHub Actions
- Shell Scripts & Automation
- Configuration Files
- Frontend Code
- Infrastructure-as-Code
- Dependency & Supply Chain Security
- AI/LLM Integration Code
- Atlan Technology Context
- SCA Coverage Requirements
- Internal Application Exposure
- Code Repository Governance

All standard Atlan security guidelines apply with high fidelity.

---

## Version History

- **v4.2 (2026-03-15):** Added argopm repo-specific security: K8s secret exposure prevention, S3 bucket config validation, untrusted YAML deserialization safety, file path traversal prevention, K8s error handling. Included ❌/✅ code examples.
- **v4.2 (2026-02-11):** Added SCA, Internal Application Exposure, Code Repository Governance.
- **v4.1 (2026-02-11):** Added Owners & Contact, SSRF, rate limiting, .env rules.
- **v4.0 (2026-02-11):** Initial structure.
