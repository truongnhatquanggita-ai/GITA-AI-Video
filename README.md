# GITA AI V50 — Cloudflare Native Autonomous Media OS

V50 is a GitHub-ready Cloudflare control plane for AI media production. It does not fake GPU rendering: completion requires a real render provider callback whose artifact exists in R2.

## Architecture
- Cloudflare Workers: API + static web app
- D1: projects, productions, events, audit, agents, costs, series
- R2: source assets and real output artifacts
- Durable Objects: strongly consistent live production state
- Queues: durable render dispatch, retry and DLQ
- Workers AI: story/director intelligence
- External render plane: GPU/ComfyUI/video/voice/music/lipsync/VFX/FFmpeg via provider contract

## Security
Set `OWNER_API_KEY` as a Worker secret. Configure `ALLOWED_ORIGINS` for production. Provider token is also a secret. Never commit secrets.

## Quick start
1. `npm install`
2. Create D1: `npx wrangler d1 create gita-ai-v50`, paste id into `wrangler.jsonc`.
3. Create R2: `npx wrangler r2 bucket create gita-ai-v50-media`.
4. Create queues: `npx wrangler queues create gita-ai-v50-render` and `npx wrangler queues create gita-ai-v50-render-dlq`.
5. Secrets: `npx wrangler secret put OWNER_API_KEY`, optionally `RENDER_API_TOKEN`.
6. `npm run db:migrate:remote`
7. `npm run check`
8. `npm run deploy`

See `DEPLOY_CLOUDFLARE_VI.md` and `docs/RENDER_PROVIDER_CONTRACT.md`.
