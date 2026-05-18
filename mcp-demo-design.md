# Harness MCP Demo — Systems Design

App code and Harness pipeline YAML live in the same repo. A `git push` triggers CI → CD in under 2 minutes. Failures are diagnosed from the IDE via the Harness MCP Server — no browser required.

---

## 1. The Core Story

```
1. Edit src/  OR  .harness/pipeline.yaml
2. git push  →  webhook  →  Harness loads pipeline YAML from that branch
3. Build breaks?  Ask Claude: "What failed?"
   → harness_diagnose  →  root cause in-editor
4. Fix  →  push  →  green in < 2 min
```

Because the pipeline YAML is in the repo, one commit can change the app *and* how it's built. Pipeline refactors go through the same loop — no manual UI sync.

---

## 2. Repository Layout

```
harness-mcp-demo/
├── src/
│   ├── index.ts
│   ├── routes/
│   │   ├── health.ts               # GET /health  →  { status, version }
│   │   └── quotes.ts               # GET /quotes, GET /quotes/:id
│   └── __tests__/
│       ├── health.test.ts
│       └── quotes.test.ts
├── Dockerfile                      # Multi-stage, node:20-alpine final image
├── package.json / tsconfig.json / jest.config.js
├── k8s/
│   ├── namespace.yaml
│   ├── deployment.yaml             # 1 replica, imagePullPolicy: Always
│   └── service.yaml
├── .harness/
│   ├── pipeline.yaml               # CI + CD pipeline (remote/git-backed)
│   └── triggers/
│       └── on-push.yaml
├── CLAUDE.md                           # Claude workspace context
├── .vscode/
│   └── mcp.json                    # Harness MCP config
└── .env.example
```

**`.harness/` is the source of truth.** Harness Git Experience reads the pipeline YAML from the triggering git ref — a push to `feature/xyz` runs that branch's pipeline YAML, not main. Pipeline changes are PR-reviewed alongside app changes, and `git revert` rolls back both.

---

## 3. Application — `quote-service`

Minimal TypeScript/Express microservice. Stateless, no database, fast build.

```
GET /health      →  { "status": "ok", "version": "<GIT_SHA>" }
GET /quotes      →  { "quote": "...", "author": "..." }
GET /quotes/:id  →  200 | 404
```

`GIT_SHA` injected via `ARG GIT_SHA` in the Dockerfile — curl `/health` after deploy to confirm which commit is live.

Tests: `health.test.ts` (200 + status ok) and `quotes.test.ts` (schema + known IDs). One-line edits break them on demand for the failure demo.

---

## 4. Pipeline Architecture

```
CI Stage  (~55 s)
  Run Tests (jest --ci, ~20 s)
  → Build & Push image (docker buildx + registry, ~25 s)
  → Scan image (Trivy, ~8 s, optional)

  Cache: node_modules via Harness Cache Intelligence  (-25 s on hit)
  Cache: Docker layers via --cache-from registry      (-15 s on hit)

CD Stage  (~40 s)
  Rolling Deploy (kubectl apply, ~8 s)
  → Health Check (curl /health, ~25 s)
  → Rollback step (on failure)

Total warm:  ~95 s  ✓
Total cold: ~115 s  ✓
```

---

## 5. Pipeline-as-Code & Trigger

**`.harness/triggers/on-push.yaml`**
```yaml
trigger:
  name: On Push - All Branches
  identifier: on_push_all_branches
  enabled: true
  orgIdentifier: default
  projectIdentifier: harness_mcp_demo
  pipelineIdentifier: ci_cd_pipeline
  source:
    type: Webhook
    spec:
      type: Github
      spec:
        type: Push
        spec:
          connectorRef: github_connector
          autoAbortPreviousExecutions: true
          actions: [Push]
  inputYaml: |
    pipeline:
      identifier: ci_cd_pipeline
      properties:
        ci:
          codebase:
            build:
              type: branch
              spec:
                branch: <+trigger.branch>
```

`autoAbortPreviousExecutions: true` cancels in-flight runs on fast successive pushes.

---

## 6. MCP Configuration

**`.vscode/mcp.json`**
```json
{
  "servers": {
    "harness": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "harness-mcp-v2"],
      "env": {
        "HARNESS_API_KEY": "${env:HARNESS_API_KEY}",
        "HARNESS_PROJECT": "harness_mcp_demo",
        "HARNESS_ORG": "default",
        "HARNESS_TOOLSETS": "pipelines,logs,services,environments,connectors"
      }
    }
  }
}
```

Auto-activates on folder open. `HARNESS_TOOLSETS` scopes the server to CI/CD resources only, improving tool-selection accuracy.

**`CLAUDE.md`**
```markdown
# harness-mcp-demo

Harness MCP is connected. Use it to:
- Check status:    harness_status
- Debug failures:  harness_diagnose
- View logs:       harness_get(execution_log)
- List runs:       harness_list(execution)
- Trigger a run:   harness_execute(pipeline, run)

Project: harness_mcp_demo  |  Pipeline: ci_cd_pipeline
Service: quote-service     |  Env: k8s-demo
```

---

## 7. MCP Demo Scenarios

### A — Post-push status
> "Show me the health of my project and the last 5 runs."
```
harness_status(project_id="harness_mcp_demo", include_visual=true)
harness_list(resource_type="execution", size=5)
```

### B — Failure triage
> "My last CI run failed. What went wrong?"
```
harness_list(resource_type="execution", size=1)
harness_diagnose(execution_id="<id>")
harness_get(resource_type="execution_log", resource_id="<step_id>")
```

### C — Trigger from IDE
> "Run the pipeline on feature/add-quotes."
```
harness_get(resource_type="runtime_input_template", resource_id="ci_cd_pipeline")
harness_execute(resource_type="pipeline", action="run",
  resource_id="ci_cd_pipeline", inputs={"branch": "feature/add-quotes"})
```

### D — Pipeline architecture
> "Draw the pipeline structure."
```
harness_diagnose(resource_id="ci_cd_pipeline", visual_type="architecture")
```

### E — Deployment readiness
> "Is anything blocking deployment to k8s-demo?"
```
harness_list(resource_type="connector")
harness_list(resource_type="delegate")
harness_list(resource_type="execution", size=5)
```

### F — Regression hunt
> "Pipeline was green yesterday, failed today. What changed?"
```
harness_list(resource_type="execution", size=5)
harness_get(resource_type="execution", resource_id="<id-1>")
harness_get(resource_type="execution", resource_id="<id-2>")
harness_diagnose(execution_id="<failing-id>")
```

---

## 8. Intentional-Failure Branches

| Branch | Failure | `harness_diagnose` output |
|---|---|---|
| `demo/failing-test` | `quotes.test.ts` schema mismatch | Exact assertion diff |
| `demo/docker-build-error` | `COPY dist/missing.js` | `file not found` |
| `demo/bad-k8s-manifest` | `cpu: "999"` → unschedulable | `0/1 nodes: insufficient CPU` |
| `demo/slow-test` | 90 s sleep in test | `Timeout exceeded` |
| `demo/green` | Clean baseline | — |

`demo/bad-k8s-manifest` is the strongest: CI passes, CD fails, and `visual_type="timeline"` renders a Gantt with CI green and the rollout step red.

---

## 9. Pre-Provisioned Harness Resources

| Identifier | Type | Notes |
|---|---|---|
| `github_connector` | GitHub App connector | Repo auth + pipeline YAML read |
| `docker_registry_connector` | Docker connector | Image push |
| `k8s_cluster_connector` | Kubernetes connector | CD target |
| `k8s-demo` | Environment | `PreProduction` |
| `k8s-demo-infra` | Infrastructure | Namespace: `harness-mcp-demo` |
| `quote-service` | Service | References `k8s/` manifests |
| `harness_mcp_demo` | Project | Scope for all resources |

---

## 10. Pipeline YAML (`.harness/pipeline.yaml`)

```yaml
pipeline:
  name: CI/CD Pipeline
  identifier: ci_cd_pipeline
  projectIdentifier: harness_mcp_demo
  orgIdentifier: default
  tags:
    managed-by: git

  properties:
    ci:
      codebase:
        connectorRef: github_connector
        repoName: harness-mcp-demo
        build: <+input>

  stages:

    - stage:
        name: Build & Test
        identifier: ci_stage
        type: CI
        spec:
          cloneCodebase: true
          caching:
            enabled: true
            paths: [node_modules]
          execution:
            steps:

              - step:
                  name: Run Tests
                  identifier: run_tests
                  type: Run
                  spec:
                    image: node:20-alpine
                    command: |
                      npm ci --prefer-offline
                      npm test -- --ci --forceExit
                    reports:
                      type: JUnit
                      spec:
                        paths: ["junit.xml"]

              - step:
                  name: Build & Push Image
                  identifier: build_push
                  type: BuildAndPushDockerRegistry
                  spec:
                    connectorRef: docker_registry_connector
                    repo: your-org/quote-service
                    tags:
                      - <+trigger.commitSha>
                      - latest
                    buildArgs:
                      GIT_SHA: <+trigger.commitSha>
                    remoteCacheImage: your-org/quote-service:cache

    - stage:
        name: Deploy to k8s-demo
        identifier: cd_stage
        type: Deployment
        spec:
          deploymentType: Kubernetes
          service:
            serviceRef: quote_service
            serviceInputs:
              serviceDefinition:
                spec:
                  artifacts:
                    primary:
                      sources:
                        - identifier: docker
                          spec:
                            tag: <+trigger.commitSha>
          environment:
            environmentRef: k8s_demo
            infrastructureDefinitions:
              - identifier: k8s_demo_infra
          execution:
            steps:

              - step:
                  name: Rolling Deploy
                  identifier: rolling_deploy
                  type: K8sRollingDeploy
                  timeout: 2m
                  spec:
                    skipDryRun: false

              - step:
                  name: Health Check
                  identifier: health_check
                  type: Run
                  spec:
                    image: curlimages/curl:latest
                    command: |
                      sleep 10
                      curl -sf http://quote-service.harness-mcp-demo.svc/health \
                        | grep -q '"status":"ok"'
                    timeout: 30s

            rollbackSteps:
              - step:
                  name: Rollback
                  identifier: rollback
                  type: K8sRollingRollback
                  spec: {}
```

---

## 11. Additional MCP Use-Cases

| Use-case | MCP call |
|---|---|
| Retry failed run | `harness_execute(execution, retry)` |
| Abort in-progress run | `harness_execute(execution, interrupt)` |
| List + approve pending gates | `harness_list(approval_instance)` → `harness_execute(approval_instance, approve)` |
| PR → pipeline correlation | `harness_list(execution, filter=trigger.prNumber=42)` |
| DORA metrics | `harness_get(sei_dora_metric, deployment_frequency)` |
| Toggle feature flag post-deploy | `harness_execute(feature_flag, toggle, enable=true, environment=k8s-demo)` |
| Audit trail | `harness_list(audit_event, filter=resource_id=ci_cd_pipeline)` |

---

## 12. Demo Script

**Act 1 — Setup (1 min)**
Open the repo in VS Code. Show `src/` and `.harness/pipeline.yaml` side by side.
> "One push, one webhook, one pipeline — build, test, and deploy."

**Act 2 — Green path (2 min)**
Add a quote to `src/data/quotes.ts`, push. In Claude:
> "What's the status of my pipeline?" → `harness_status` (running → green)
> "Show me the pipeline architecture." → inline diagram

**Act 3 — Failure triage (3 min)**
Checkout `demo/failing-test`, push. In Claude:
> "My build broke. What failed and how do I fix it?"
`harness_diagnose` returns the exact assertion diff and suggested fix. Apply, push — green in < 2 min.

**Act 4 — Pipeline-as-code (90 s)**
> "Add a step that prints the deployed image SHA after the health check."
AI reads the pipeline via MCP, updates the YAML, commits it back. Show the commit in GitHub.

---

*Reference: https://developer.harness.io/docs/platform/harness-ai/harness-mcp-server*