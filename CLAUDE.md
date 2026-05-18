# harness-mcp-demo

Minimal TypeScript/Express service (`quote-service`) wired to a Harness CI/CD
pipeline. The pipeline YAML lives in `.harness/` and is loaded from the
triggering git ref — pipeline changes ship in the same PR as app changes.

Harness MCP is connected. Use it to:
- Check status:    `harness_status`
- Debug failures:  `harness_diagnose`
- View logs:       `harness_get(execution_log)`
- List runs:       `harness_list(execution)`
- Trigger a run:   `harness_execute(pipeline, run)`

Project: `harness_mcp_demo`  |  Pipeline: `ci_cd_pipeline`
Service: `quote-service`     |  Env: `k8s-demo`

## Layout
- `src/` — Express app + Jest tests
- `Dockerfile` — multi-stage, `node:20-alpine`, `ARG GIT_SHA`
- `k8s/` — namespace, deployment, service (1 replica, `imagePullPolicy: Always`)
- `.harness/pipeline.yaml` — CI + CD stages
- `.harness/triggers/on-push.yaml` — push trigger, all branches

## Local dev
```
npm ci
npm test
npm run build && npm start   # http://localhost:3000/health
```

## Demo branches
| Branch | Failure |
|---|---|
| `demo/green` | Clean baseline |
| `demo/failing-test` | `quotes.test.ts` schema mismatch |
| `demo/docker-build-error` | `COPY dist/missing.js` in Dockerfile |
| `demo/bad-k8s-manifest` | `cpu: "999"` — unschedulable |
| `demo/slow-test` | 90 s sleep — test timeout |
