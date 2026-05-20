# harness-mcp-demo

A minimal TypeScript/Express service (`quote-service`) wired to a
Harness CI/CD pipeline. App code and pipeline YAML live in the same
repo — a `git push` triggers CI → CD in under 2 minutes, and failures
are diagnosed from the IDE through the Harness MCP Server, no browser
required.

See [mcp-demo-design.md](mcp-demo-design.md) for the full design.

## Repository layout

```
.
├── src/                      # Express app + Jest tests
│   ├── app.ts
│   ├── index.ts
│   ├── data/quotes.ts
│   ├── routes/health.ts      # GET /health
│   ├── routes/quotes.ts      # GET /quotes, GET /quotes/:id
│   └── __tests__/
├── Dockerfile                # Multi-stage, node:20-alpine, ARG GIT_SHA
├── k8s/                      # namespace, deployment, service
├── .harness/
│   ├── pipeline.yaml         # CI + CD pipeline (git-backed)
│   └── triggers/on-push.yaml # Push trigger, all branches
├── .vscode/mcp.json          # Harness MCP server config
└── CLAUDE.md                 # Workspace context for Claude
```

## API

```
GET /health      → { "status": "ok", "version": "<GIT_SHA>" }
GET /quotes      → { "id", "quote", "author" }   (random)
GET /quotes/:id  → 200 (the quote) | 404
```

`GIT_SHA` is injected at image build time via `ARG GIT_SHA` so curling
`/health` after deploy confirms which commit is live.

## Local development

```bash
npm ci
npm test                    # 4 tests, ~1s
npm run build && npm start  # listens on :3000
```

Then:

```bash
curl localhost:3000/health
curl localhost:3000/quotes
curl localhost:3000/quotes/1
```

## CI/CD

The pipeline lives in [.harness/pipeline.yaml](.harness/pipeline.yaml)
and is loaded from the triggering git ref — a push to `feature/xyz`
runs that branch's pipeline YAML, not main's. Pipeline changes ship in
the same PR as app changes.

```
CI Stage  (~55 s)
  Run Tests           (jest --ci)
  Build & Push Image  (docker buildx → registry, GIT_SHA build-arg)

CD Stage  (~40 s)
  Rolling Deploy      (K8sRollingDeploy)
  Health Check        (curl /health, status=ok)
  Rollback            (on failure, K8sRollingRollback)
```

## Demo branches

Each branch breaks the pipeline at a different stage so
`harness_diagnose` has a clean failure to talk about.

| Branch | Failure | Diagnosis surface |
|---|---|---|
| `demo/green` | none — clean baseline | — |
| `demo/failing-test` | schema mismatch in `quotes.test.ts` | jest assertion diff |
| `demo/docker-build-error` | `COPY dist/missing.js` | `file not found` in build log |
| `demo/bad-k8s-manifest` | `cpu: "999"` — unschedulable | `0/N nodes: insufficient cpu` |
| `demo/slow-test` | 90 s sleep in test | `Exceeded timeout of 5000 ms` |

`demo/bad-k8s-manifest` is the strongest demo: CI passes, CD fails,
and the timeline view shows CI green / rollout red.

## Using the MCP server

`.vscode/mcp.json` registers the Harness MCP server and auto-activates
on folder open. With Claude in the editor:

```
"What's the status of my pipeline?"          → harness_status
"My last CI run failed. What went wrong?"    → harness_diagnose
"Show me the pipeline architecture."         → harness_diagnose(visual_type=architecture)
"Run the pipeline on feature/add-quotes."    → harness_execute(pipeline, run)
```

Project: `harness_mcp_demo`  ·  Pipeline: `ci_cd_pipeline`
Service: `quote-service`     ·  Environment: `k8s-demo`

Set `HARNESS_API_KEY` in your shell before opening the workspace.
