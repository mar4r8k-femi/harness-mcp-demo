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

The repo root is the source of truth for both the app and its delivery pipeline. See the actual tree on disk; the load-bearing files are:

- App code: [src/](src/) (entry [src/index.ts](src/index.ts), routes in [src/routes/](src/routes/), tests in [src/__tests__/](src/__tests__/))
- Container: [Dockerfile](Dockerfile)
- Kubernetes manifests: [k8s/](k8s/) (namespace, deployment, service)
- Pipeline-as-code: [.harness/pipeline.yaml](.harness/pipeline.yaml), trigger in [.harness/triggers/on-push.yaml](.harness/triggers/on-push.yaml)
- IDE wiring: [.vscode/mcp.json](.vscode/mcp.json), [CLAUDE.md](CLAUDE.md)
- Build/runtime config: [package.json](package.json), [tsconfig.json](tsconfig.json), [jest.config.js](jest.config.js), [.env.example](.env.example)

**[.harness/](.harness/) is the source of truth for delivery.** Harness Git Experience reads the pipeline YAML from the triggering git ref — a push to `feature/xyz` runs that branch's pipeline YAML, not main. Pipeline changes are PR-reviewed alongside app changes, and `git revert` rolls back both.

---

## 3. Application — `quote-service`

Minimal TypeScript/Express microservice. Stateless, no database, fast build.

Endpoints (defined in [src/routes/](src/routes/)):

| Method | Path | Returns |
|---|---|---|
| GET | `/health` | `{ status, version }` — version is the deployed `GIT_SHA` |
| GET | `/quotes` | a random quote object |
| GET | `/quotes/:id` | 200 with the quote, or 404 |

`GIT_SHA` is injected via `ARG GIT_SHA` in [Dockerfile](Dockerfile) and surfaced as `process.env.GIT_SHA` — curling `/health` after deploy confirms which commit is live.

Tests in [src/__tests__/](src/__tests__/) cover both routes. One-line edits break them on demand for the failure demo (see §8).

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

The full stage/step definitions live in [.harness/pipeline.yaml](.harness/pipeline.yaml).

---

## 5. Pipeline-as-Code & Trigger

The push trigger is defined in [.harness/triggers/on-push.yaml](.harness/triggers/on-push.yaml). Key behaviors:

- Listens on `github_connector` for `Push` events on **all branches**.
- Sets the codebase build to the pushed branch via `<+trigger.branch>`, so each branch builds its own [.harness/pipeline.yaml](.harness/pipeline.yaml).
- `autoAbortPreviousExecutions: true` cancels in-flight runs on fast successive pushes — the most recent commit wins.

---

## 6. MCP Configuration

The Harness MCP server is registered in [.vscode/mcp.json](.vscode/mcp.json) and auto-activates on folder open. It runs over stdio via `npx harness-mcp-v2`, pulls `HARNESS_API_KEY` from the environment, and pins the project (`harness_mcp_demo`), org (`default`), and toolsets (`pipelines,logs,services,environments,connectors`). Scoping the toolsets improves tool-selection accuracy.

[CLAUDE.md](CLAUDE.md) holds the workspace context Claude reads on session start: which MCP tools are wired up, the project/pipeline/service/env identifiers, and a pointer to the demo branches.

---

## 7. MCP Demo Scenarios

Each scenario shows the user prompt and the MCP tools it should resolve to. Tool names are per the Harness MCP Server reference — see https://developer.harness.io/docs/platform/harness-ai/harness-mcp-server.

**A — Post-push status.** *"Show me the health of my project and the last 5 runs."* → `harness_status` for the project, then `harness_list` over `execution` (size 5).

**B — Failure triage.** *"My last CI run failed. What went wrong?"* → `harness_list` for the latest execution → `harness_diagnose` on its id → `harness_get` on the failing step's `execution_log` for the raw output.

**C — Trigger from IDE.** *"Run the pipeline on feature/add-quotes."* → `harness_get` for the runtime input template → `harness_execute` (`pipeline`, `run`) with `branch: feature/add-quotes`.

**D — Pipeline architecture.** *"Draw the pipeline structure."* → `harness_diagnose` against `ci_cd_pipeline` with `visual_type=architecture` for an inline diagram.

**E — Deployment readiness.** *"Is anything blocking deployment to k8s-demo?"* → `harness_list` over `connector`, `delegate`, and recent `execution` results.

**F — Regression hunt.** *"Pipeline was green yesterday, failed today. What changed?"* → `harness_list` recent executions → `harness_get` on the last green and first red → `harness_diagnose` on the failing one.

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
| `quote-service` | Service | References [k8s/](k8s/) manifests |
| `harness_mcp_demo` | Project | Scope for all resources |

---

## 10. Pipeline Definition

The full pipeline (CI build/test/push, CD rolling deploy + health check + rollback) is defined in [.harness/pipeline.yaml](.harness/pipeline.yaml). Highlights:

- **CI stage** clones the repo, restores `node_modules` via Harness Cache Intelligence, runs `npm test` with JUnit reporting, then builds and pushes the image with `<+trigger.commitSha>` baked in as the `GIT_SHA` build arg and image tag.
- **CD stage** deploys to the `k8s_demo` environment using `K8sRollingDeploy`, then curls `/health` from inside the cluster and asserts `"status":"ok"`. A `K8sRollingRollback` rollback step runs if any step in the stage fails.

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
Open the repo in VS Code. Show [src/](src/) and [.harness/pipeline.yaml](.harness/pipeline.yaml) side by side.
> "One push, one webhook, one pipeline — build, test, and deploy."

**Act 2 — Green path (2 min)**
Add a quote to [src/data/quotes.ts](src/data/quotes.ts), push. In Claude:
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
