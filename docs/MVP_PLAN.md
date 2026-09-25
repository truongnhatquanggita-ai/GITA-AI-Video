# MVP plan for GITA AI V50

## Phase 1 — secure foundation

### Goals
- Establish a Cloudflare Worker foundation with safe defaults and no committed secrets.
- Keep the API and render pipeline explicit, auditable, and easy to test.
- Put CI in place so type checks and worker-side tests run on every push and pull request.

### Deliverables
1. Secure request layer
   - API key validation for owner-facing routes.
   - HMAC-based provider callback verification.
   - CORS preflight support for browser-safe calls.
2. Production orchestration model
   - Project, series, and production lifecycle persisted in D1.
   - Render queue semantics with provider-block handling.
   - Artifact verification before marking a production complete.
3. Quality gates
   - Type checking with `npm run check`.
   - Automated tests for validation helpers.
   - CI workflow on GitHub Actions.

### Scope boundaries for MVP
- Not a full GPU rendering engine yet.
- Not a production provider integration with live SaaS credentials.
- Not a multi-tenant auth system or fine-grained RBAC.

### Exit criteria
- `npm run check` passes.
- `npm test` passes.
- Secrets remain outside the repository and are documented via `.dev.vars.example`.
- The repo is ready for a reviewable pull request.

## Phase 2 — production workflow
- Add full project and series CRUD flow.
- Expand queue worker to handle retries, DLQ, and status reconciliation.
- Add admin UI for project status and artifact review.

## Phase 3 — provider connection and release hardening
- Connect to a real render provider.
- Add monitoring, audit retention, and content review workflows.
- Finalize deployment and release gates.
