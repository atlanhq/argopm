# CLAUDE.md — Atlan AI Agent Guidelines (Claude Code Edition)

> **Version:** 4.2
> **Last Updated:** 2026-03-15
> **Applies To:** Claude Code sessions on Atlan argopm codebase
> **Full Policy:** See `AGENTS.md` for the comprehensive version with all domain-specific details.
> **⚠️ Always read `AGENTS.md` in addition to this file before making changes.** This file is a lean summary; `AGENTS.md` contains the full security policy with all domain-specific rules.

**All AI agents must follow these guidelines when generating, modifying, or reviewing code in Atlan repositories.**

---

## Security

> **All AI agents must follow these guidelines for every code change.**
> **For detailed domain-specific rules** (expanded Backend, Helm, CI/CD, Shell, Config, Frontend, IaC, Dependencies, AI/LLM), see `AGENTS.md § Security`.

### Owners & Contact

- **Security Team:** For questions, concerns, or proposed changes to `AGENTS.md` / `CLAUDE.md`, reach out to the **Atlan Security Team** (`@security-team` on Slack / GitHub).
- **Manual Security Review:** If your changes are risky or touch critical security surfaces (auth flows, multi-tenant isolation, secrets management, new external integrations, new API endpoints), **request a manual security review** from the Security team before merging.

---

### Repo-Specific Security: argopm

This Node.js CLI interacts with K8s APIs to manage Argo Workflow packages and uploads artifacts to AWS S3. It loads K8s credentials from environment/KUBECONFIG and reads secrets/configmaps.

**Guidelines:**

1. **[MUST] Never Log K8s Secrets:** When listing secrets or accessing K8s secrets (lines 73–80 in `package.js`), only display secret metadata (name, namespace). Never log secret data, values, or `data` fields. Print only `secret.metadata.name`.

2. **[MUST] S3 Bucket Config from K8s ConfigMap Only:** S3 bucket and region must be loaded from a K8s ConfigMap (current pattern in `s3.js:45–65`). Never accept bucket/region as CLI args or environment variables — always verify they come from K8s API.

3. **[MUST] Validate S3 Key Prefix:** The S3 key prefix (`argo-artifacts/argopm/<package-name>/latest/static`) must never include untrusted user input. Always use package metadata from K8s, never from CLI args.

4. **[MUST] K8s API Errors → Generic Responses:** When K8s API calls fail (e.g., `readNamespacedConfigMap` line 52), log the error server-side but return generic error to user. Never expose K8s error messages, namespace names, or resource details to CLI output.

5. **[REDLINE] No YAML Deserialization of Untrusted Input:** The code uses `yaml.load()` (lines 54–55) on K8s ConfigMap data. Only deserialize YAML from K8s ConfigMap (trusted source). Never call `yaml.load()` on user-provided YAML or CLI input.

6. **[MUST] File Uploads Must Validate Paths:** When uploading files (s3.js:72–99), ensure paths are within expected `static/` subdirectory. Prevent path traversal (e.g., `../../sensitive-file`). Use absolute path resolution and validate against allowed directory.

7. **[SHOULD] AWS S3 Client Lifecycle:** Initialize S3Client once and reuse across uploads. Properly close/destroy the client on process exit to avoid connection leaks.

8. **[SHOULD] Kubernetes Client Scoping:** The KubeConfig is loaded globally at module level (package.js:8–12). Limit API access to only required resources/verbs via RBAC; never use wildcard permissions in K8s service account.

---

### Quickstart

1. Identify what you're changing (Backend, Frontend, K8s, CI/CD, Shell, Config, IaC, Docker, Dependencies, AI/LLM)
2. Apply **Security Invariants** to every change
3. CRITICAL issues → **block**. HIGH/MEDIUM/LOW → **flag with fix**.
4. Use 🔒 SECURITY REVIEW format for MEDIUM+ issues.

**Tags:** `[MUST]` = required | `[REDLINE]` = forbidden | `[SHOULD]` = best practice | `[NICE]` = defense-in-depth

---

### Security Invariants (Always Apply)

- **[MUST] No secrets in code or logs** (keys, tokens, passwords, private URLs, customer credentials).
- **[MUST] Multi-tenant isolation is non-negotiable:** `tenant_id` from **authenticated context only**, never request input.
- **[MUST] Parameterize data access:** never concatenate user input into SQL/queries/filters.
- **[MUST] Auth & authz must be real:** no "phantom auth" (imported but unused middleware).
- **[MUST] No wildcards:** no `CORS: *`, no IAM `Action:"*"`, no K8s RBAC `resources:["*"]`, no GitHub `write-all`.
- **[MUST] Don't execute untrusted input:** no `eval`, no unsafe deserialization, no command injection, no CI `run:` injection.
- **[MUST] Pin supply chain:** actions→**SHA**, images→**version/SHA**, no `latest`, verify deps exist.
- **[MUST] Safe errors:** generic to clients; internal details server-side only.
- **[MUST] Log safely:** never log tokens, cookies, secrets, or sensitive bodies (see Logging Redlines).
- **[MUST] Validate outbound URLs (SSRF):** allowlist all outbound URLs from user input; deny internal/private IP ranges (10.x, 172.16-31.x, 192.168.x), localhost, and cloud metadata endpoints (169.254.169.254).
- **[MUST] Rate limit abuse-prone endpoints:** all auth, password reset, token generation, and sensitive API endpoints must have rate limiting before merging.
- **[MUST] New API endpoints must ship secure:** every new endpoint must have auth, authz, input validation, and rate limiting before merge. Do **not** accept "auth can be added later" — security is not a follow-up.
- **[MUST] No `.env` files with real secrets in version control.** `.env`, `.env.local`, `.env.production` must be in `.gitignore`. `.env.example` files must contain only placeholders (`API_KEY=changeme`), never real credentials. **Block any commit with real secrets in `.env` files.**
- **[MUST] All code must reside in approved GitHub organizations** (e.g., AtlanHQ). Flag any reference to personal repos, personal GitHub accounts, or code imports from non-organizational sources.

---

### Secret Discovery Protocol

**If you discover a secret in code, config, logs, or CI output — treat as CRITICAL:**

1. **Do NOT commit, push, or log the secret further.**
2. **Flag immediately** with 🔒 SECURITY REVIEW, severity `CRITICAL`.
3. **Recommend:** Revoke/rotate the credential immediately.
4. **Check git history:** If secret was in a previous commit, rotation is mandatory.
5. **Notify Security team** — exposed secrets require incident tracking.

**Common secret patterns:** `AKIA...` (AWS), `sk-...` (OpenAI), `ghp_...` (GitHub), `xoxb-`/`xoxp-` (Slack), `-----BEGIN PRIVATE KEY-----`, connection strings with passwords, variables named `*_SECRET`/`*_KEY`/`*_TOKEN`/`*_PASSWORD` with non-placeholder values.

---

### Data Classification

**[MUST]** Flag new data fields that appear to contain sensitive information:

| Classification | Examples | Action |
|---------------|----------|--------|
| **PII** | name, email, phone, address, SSN | Ensure encrypted, masked in logs, tenant-scoped |
| **Financial** | credit card, bank account, billing | Flag as HIGH; PCI-DSS may apply |
| **Authentication** | passwords, tokens, API keys | Flag as CRITICAL if stored/logged improperly |
| **Health** | PHI, medical records | Flag as CRITICAL; HIPAA applies |

---

### Logging Redlines

- **[REDLINE]** Never log: access/refresh tokens, session cookies, API keys, Authorization headers, private keys.
- **[MUST]** No full request/response body logging by default (especially auth and PII paths).
- **[MUST]** Include `tenant_id` (from auth context) in structured logs for audit.
- **[SHOULD]** Automatic masking for known secret patterns.

---

### Multi-Tenant Security (Non-Negotiable)

**[MUST]** `tenant_id` from authenticated session → enforced in every query → return 404 on miss (not 403).

**Anti-patterns:**
```txt
❌ tenant_id = request.params["tenant_id"]     // attacker can swap tenant
❌ SELECT * FROM resources WHERE id = ?        // missing tenant filter
❌ /api/tenants/{tenant_id}/resources          // who verifies tenant ownership?
✅ tenant_id from auth + enforced everywhere (DB, cache, storage, search, queues, webhooks)
```

---

### Code Type Quick Reference

| Code Type | Key Risks |
|-----------|-----------|
| **Backend/API** | SQLi, auth bypass, SSRF, tenant isolation, mass assignment |
| **Helm/K8s** | Privileged containers, RBAC escalation, secret exposure, DoS |
| **CI/CD** | Workflow injection, unpinned actions, secret leakage, excessive perms |
| **Shell** | Command injection, creds in args, unsafe temp files, unquoted vars |
| **Config** | Hardcoded secrets, debug mode, CORS wildcards, exposed ports |
| **Frontend** | XSS, token in localStorage, open redirects, CSP bypass |
| **IaC** | Public buckets, overpermissive IAM, unencrypted resources, open SGs |
| **Dependencies** | Typosquatting, CVEs, lockfile manipulation, supply chain attacks |
| **AI/LLM** | Prompt injection, data leakage, PII exposure, unsafe output execution (never pass LLM output to `eval`, SQL, shell commands, or `innerHTML` — leads to code/command/SQL injection and XSS) |

---

### Security Review Format

**MEDIUM+ issues:**
```txt
🔒 SECURITY REVIEW

Issue: [description]
Severity: CRITICAL | HIGH | MEDIUM | LOW
Location: [file:line]
Category: [STRIDE]
Risk: [Atlan-specific impact]
Recommended Fix: [concrete fix]
```

**LOW / quick:** `⚡ Security note: [risk] → [fix]`

---

### Severity Rules

| Severity | Criteria | Action |
|----------|----------|--------|
| **CRITICAL** | RCE, data breach, cross-tenant, credential exposure, full auth bypass, CRITICAL CVEs | **Block** — must fix |
| **HIGH** | Endpoint auth bypass, privilege escalation, tenant isolation gap, HIGH CVEs | **Block** — must fix before merging |
| **MEDIUM** | Info disclosure, weak config, CORS issues, missing controls | **Flag** |
| **LOW** | Best practice gaps, defense-in-depth improvements | **Note** |

---

### Atlan Technology Context

| Component | Technology | Key Risks |
|-----------|-----------|-----------|
| Workflow | Temporal (migrating from Argo) | Workflow RCE, over-privileged SAs |
| Identity | Keycloak (OAuth2/OIDC) | JWT gaps, refresh token exposure |
| Gateway | Kong | CORS misconfig, admin exposure, plugin ordering |
| Logs | ClickHouse | Cross-tenant log access |
| AI/ML | Azure OpenAI | Prompt injection, data leakage |
| Secrets | AWS Secrets Manager, Vault | Over-privileged access, rotation gaps |
| Compliance | SOC2, GDPR, HIPAA | Audit logging, data residency, PHI protection |

---

### Security Checklist (Top Items)

- [ ] No secrets in code/config/logs/CI output
- [ ] `tenant_id` enforced from auth context in every query
- [ ] Client errors don't expose stack traces/SQL/paths/internal IPs
- [ ] Input validated; parameterized queries only
- [ ] Auth enforced; authz verifies tenant + user ownership
- [ ] Actions pinned to SHAs; images pinned to versions
- [ ] Containers run as non-root; minimal capabilities
- [ ] RBAC least privilege; no wildcards
- [ ] No unsafe HTML rendering; tokens not in localStorage
- [ ] No untrusted input in CI `run:` blocks; minimum workflow permissions
- [ ] CRITICAL and HIGH CVEs blocked; MEDIUM flagged for review
- [ ] New API endpoints have auth, authz, input validation, and rate limiting
- [ ] No `.env` files with real secrets committed; `.gitignore` covers `.env*`
- [ ] All code in approved GitHub org (AtlanHQ); no personal repo references
- [ ] SCA scanning (Snyk) configured for new/migrated repos

> **For the full checklist and all domain-specific details**, see `AGENTS.md § Security`.

---

### SCA Coverage Requirements

- **[MUST]** All repos in approved GitHub orgs must be enrolled in **SCA scanning (Snyk)**. No exceptions.
- **[MUST]** When onboarding or migrating a repo, verify Snyk integration is configured — not as a follow-up.
- **[MUST]** For critical/zero-day CVEs, identify **ALL affected applications within 24 hours**.

**Agent behavior:** When creating new projects or migrating code, include SCA tool configuration (Snyk) in the setup checklist. Flag if missing.

---

### Internal Application Exposure

- **[MUST]** Internal apps must **not be exposed to the public internet** without security review. Default to **VPN-only access**.
- **[MUST]** All internet-facing subdomains must have **CloudFlare WAF enabled** with virtual patching for known critical CVEs.
- **[MUST]** Security recommendations must be **formally tracked** with owner, due date, and verified closure.

**Agent behavior:** If you see code deploying a new service/subdomain/endpoint, flag whether it should be public or internal. If internal → verify VPN/network restriction. If public → verify WAF and authentication.

---

### Code Repository Governance

- **[MUST]** All production/internal code must reside in **approved GitHub organizations** (e.g., AtlanHQ). Personal GitHub accounts lack SCA, secret detection, branch protection, and audit visibility.
- **[MUST]** Flag any reference to personal repos, personal GitHub accounts, or imports from non-organizational sources.

**Agent behavior:** When you encounter imports, submodules, or references to repos outside the approved org, flag it and recommend migrating to the org.

---

## Version History

- **v4.2 (2026-03-15):** Added repo-specific security guidelines for argopm (K8s secrets logging redaction, S3 bucket config validation, S3 key prefix sanitization, K8s error handling, YAML deserialization safety, file upload path validation, S3 client lifecycle, K8s client RBAC scoping).
- **v4.2 (2026-02-11):** Added SCA Coverage Requirements (Snyk enrollment); Internal Application Exposure rules (VPN-only default, CloudFlare WAF); Code Repository Governance (approved GitHub orgs only, flag personal repos); approved org invariant.
- **v4.1 (2026-02-11):** Added Owners & Contact; SSRF invariant; rate limiting as [MUST]; new API endpoint security requirements; .env file rules with secret patterns; Secret Discovery Protocol; Data Classification guidelines; CVE blocking (CRITICAL/HIGH); clarified unsafe LLM output; "Always read AGENTS.md" directive; manual security review escalation.
- **v4.0 (2026-02-11):** Initial CLAUDE.md — lean version optimized for Claude Code context efficiency; all security content under `## Security`; added project/conventions/architecture placeholders; points to `AGENTS.md` for full domain-specific details.
