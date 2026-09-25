# GITA AI V50 — Production rebuild

Branch: `v50-production-rebuild`

This branch is a secure production foundation for a Cloudflare-native video-series control plane. It provides projects, series-ready production records, 50 policy-controlled agent definitions, D1 persistence, R2 artifact verification, Queue dispatch, Durable Object rooms, signed provider callbacks, audit records and a modern operator UI.

## Important scope

The 50 agents are an auditable orchestration catalogue with domains and KPI policies. They are not claimed to be independently trained models or a guarantee of 100% output quality. Actual generation requires a configured, tested render provider and human/automated quality gates.

## Setup

```bash
npm install
npx wrangler d1 create gita-ai-v50
npx wrangler r2 bucket create gita-ai-v50-media
npx wrangler queues create gita-ai-v50-render
npx wrangler queues create gita-ai-v50-render-dlq
```

Put the D1 id in `wrangler.jsonc`, then configure local secrets in `.dev.vars` (never commit it):

```bash
OWNER_API_KEY=...
RENDER_API_URL=...
RENDER_API_TOKEN=...
WEBHOOK_SECRET=...
```

Run:

```bash
npm run db:migrate:local
npm run check
npm run dev
```

For remote deployment, use `wrangler secret put` for every secret, apply remote migrations, then run `npm run deploy`.

## Provider callback

The provider must POST JSON to `/api/v1/provider/callback` and send `X-Webhook-Signature`, an HMAC-SHA256 hex digest over the exact request body using `WEBHOOK_SECRET`. It must upload the artifact to the configured R2 bucket before sending `status: complete`.

## Safety controls

- API key is never stored in frontend code.
- CORS is allowlist-based.
- Provider callbacks are signed.
- A production cannot become COMPLETE without a non-empty R2 object.
- Queue jobs are persisted and retried by Cloudflare Queue semantics.
- Agent metadata is policy-controlled and stored for future run/KPI records.
- Production quality still needs provider integration, integration tests, monitoring, content rights review and human approval for release.
