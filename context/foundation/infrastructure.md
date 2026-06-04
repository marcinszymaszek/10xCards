---
project: 10xCards
researched_at: 2026-05-31
recommended_platform: Cloudflare Workers
runner_up: Railway
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 6 + React 19 islands
  runtime: Workers (workerd) for production; Node 22.15.0 for local
  database: Supabase (external)
  ai_provider: OpenRouter (external)
---

## Recommendation

**Deploy on Cloudflare Workers.**

The project already uses `@astrojs/cloudflare` (the only supported adapter for Astro 6 on Cloudflare — Pages support was removed in Astro 6; Workers is now the target). Cloudflare scored 12/12 across the five agent-friendly criteria — the only platform to do so — and is the developer's familiar platform (interview Q3). With Supabase and OpenRouter as fully external services, there is no co-location benefit to consider; the pure-serverless, isolate-based Workers runtime matches a stateless flashcard app with no persistent connections needed (Q1). The free tier covers 3M requests/month — far beyond MVP-scale traffic (Q2/Q4).

## Platform Comparison

Scored against five agent-friendly criteria: CLI-first maintenance (weight ×3), Managed/serverless (×3), Agent-readable docs (×2), Stable deploy API (×3), MCP/integration (×1). Max score = 12. Pass = full weight, Partial = half weight, Fail = 0.

| Platform | CLI-first | Managed | Agent docs | Deploy API | MCP | Score |
|---|---|---|---|---|---|---|
| **Cloudflare Workers** | Pass | Pass | Pass | Pass | Pass (GA) | **12.0** |
| Vercel | Pass | Pass | Pass | Pass | Partial (beta) | **11.5** |
| Netlify | Partial | Pass | Pass | Partial | Pass (GA) | **9.0** |
| Railway | Partial | Partial | Pass | Partial | Partial (WIP) | **7.0** |
| Fly.io | Partial | Partial | Pass | Partial | Fail (experimental) | **6.5** |
| Render | Partial | Partial | Fail | Partial | Pass (GA) | **5.5** |

**Scoring notes:**

- **CLI-first:** Cloudflare (`wrangler deploy/rollback/tail`) and Vercel (`vercel --prod/rollback/logs`) are the only platforms with a full CLI rollback command. Netlify, Railway, Railway, Fly.io, and Render all require a dashboard or API call to roll back — agents cannot complete the recovery loop unattended.
- **Managed/serverless:** Cloudflare, Vercel, and Netlify are pure serverless — no container sizing, VM management, or scale-to-zero decisions. Fly.io, Railway, and Render run container-based VMs where the developer manages replica count and instance sizing.
- **Agent-readable docs:** Cloudflare publishes `llms.txt`, `llms-full.txt`, and per-page Markdown for every product. Vercel and Netlify publish `llms.txt`/`llms-full.txt`. Fly.io and Railway have public GitHub docs repos. Render has no public doc source — docs are proprietary web-only.
- **Deploy API:** Cloudflare and Vercel have fully deterministic CLI deploy + rollback cycles. Netlify's rollback is scriptable via REST API but not wrapped in the CLI. Railway's rollback is dashboard-only. Fly.io's rollback requires knowing the prior image tag (`fly deploy --image <tag>`). Render's rollback is reachable via REST API (`POST /v1/services/{id}/rollback`) but not via CLI.
- **MCP:** Cloudflare MCP is GA at `https://docs.mcp.cloudflare.com/mcp` (2,500+ API endpoints, OAuth-secured, dedicated Claude Code integration guide). Netlify and Render MCP servers are also GA. Vercel MCP is in beta (as of 2026-04-06). Railway MCP is work-in-progress. Fly.io `fly mcp server` is experimental; Fly's own blog notes MCP is not their preferred long-term agent path.

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

The only platform with a perfect score across all five criteria. The project's `@astrojs/cloudflare` adapter already targets this runtime — no adapter swap required, which preserves the existing `wrangler.jsonc` configuration, dev toolchain, and local `workerd` dev server fidelity. `wrangler deploy`, `wrangler rollback`, and `wrangler tail` cover the full agent operational loop without touching a dashboard. Cloudflare publishes the most complete agent-readable docs of any platform (`llms-full.txt` + per-page Markdown + Skills repo) and has a GA MCP server with a dedicated Claude Code integration guide. The free tier handles 3M requests/month — no cost at MVP scale.

#### 2. Vercel

Closest runner-up at 11.5/12. Full CLI cycle (`vercel --prod/rollback/logs`), excellent agent-readable docs (`llms-full.txt`), and a stable deploy API. The gap vs. Cloudflare: Vercel MCP is still in beta (as of 2026-04-06, last updated 2026-04-06), and there is an open Astro 6 SSR esbuild parse error bug (issue #16258) to validate before deploying. Switching to Vercel requires replacing `@astrojs/cloudflare` with `@astrojs/vercel`, changing the Wrangler-based dev server setup, and accepting a slightly reduced function timeout on the Hobby tier (60s hard cap vs. Workers' 30s wall-clock — similar risk profile).

#### 3. Netlify

Strong third at 9/12. The GA Netlify MCP server (launched June 2025) and credit-based free tier (300 credits/month; 100k requests costs ~20 credits) make it attractive for agent-driven workflows. But the missing CLI rollback (rollback is dashboard or REST API only) drops CLI-first and Deploy API to Partial, making it harder for an agent to complete a recovery loop unattended. The adapter swap (`@astrojs/netlify`) is required, and there is a known breaking-change window between adapter versions 6.4.0–6.5.1 (pin to 6.5.1+).

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. **`deployment_target: cloudflare-pages` in tech-stack.md is stale.** Astro 6 dropped Cloudflare Pages support from `@astrojs/cloudflare`. Every tutorial, CI snippet, and AI-generated workflow referencing `wrangler pages deploy` is wrong for this project. Stale guidance will surface repeatedly during setup and debugging.
2. **`nodejs_compat` flag is not added automatically by the adapter.** The Supabase JS client uses `node:crypto` for PKCE auth token verification (the default in current Supabase SDK versions). Without `nodejs_compat` in `wrangler.jsonc` with `compatibility_date ≥ 2024-09-23`, sign-in works locally (Node.js runtime) but returns 500s in production.
3. **30-second wall-clock limit is a hard ceiling for AI generation.** OpenRouter calls for long prompts can take 28–32 seconds. Without streaming wired up from day one, the AI generation endpoint will time out for users pasting long documents.
4. **Per-Worker daily billing activated May 26, 2026.** The paid plan now charges per Worker per day even when idle. For one Worker at MVP scale this is negligible, but it changes the "effectively free" expectation the free-tier narrative implies.
5. **`wrangler.jsonc` and `wrangler.toml` silently conflict.** If both files exist, Wrangler CLI prefers `.toml` and ignores `.jsonc`. Tutorial snippets generate `.toml`; the starter uses `.jsonc`. Accidental coexistence causes deployments that ignore your actual config, including `nodejs_compat`.

### Pre-Mortem — How This Could Fail

The flashcard app launched on Cloudflare Workers and felt fast on day one. Deploys took three seconds, cold starts were imperceptible, and the free tier covered all traffic. Three weeks later, users pasting long study documents started seeing AI generation hang and then return a generic error. The root cause: OpenRouter was taking 28–32 seconds for complex prompts, and Workers has a hard 30-second wall-clock limit. The developer had used a standard buffered `return new Response(jsonBody)` pattern — so OpenRouter's partial output never reached the user before the timeout killed the connection. Switching to streaming required rewriting the generation endpoint to use `ReadableStream` and proper response headers, a pattern that behaves differently between the Astro dev server and the `workerd` runtime. Meanwhile, a parallel issue: email sign-up worked in development but silently failed in production with opaque 500 errors. Two hours of debugging revealed that Supabase's PKCE flow requires `node:crypto`, which wasn't available because `nodejs_compat` was absent from `wrangler.jsonc`. A `wrangler.toml` file accidentally present from a tutorial snippet was shadowing the project's `.jsonc` config. Both issues were fixable — but together they consumed a week of the two-week MVP timeline and left the developer questioning the platform choice rather than the specific misconfiguration.

### Unknown Unknowns

- **Supabase PKCE requires `node:crypto`** — The default Supabase auth flow in current SDK versions uses PKCE, which calls `node:crypto`. Without `nodejs_compat` + `compatibility_date ≥ 2024-09-23` in `wrangler.jsonc`, auth silently fails in production while passing all local tests.
- **`wrangler.jsonc` and `wrangler.toml` conflict silently** — Wrangler CLI prefers `.toml` when both exist. Tutorial-generated `.toml` files can shadow the project's `.jsonc`, causing deployments that ignore your actual config with no error or warning.
- **Streaming AI responses requires explicit `ReadableStream`** — Astro's SSR response model abstracts over streaming, but Cloudflare Workers requires `new Response(readableStream, { headers })` at the edge. Standard Astro buffered responses will hit the 30-second timeout on slow OpenRouter calls.
- **`compatibility_date` gating** — Some `nodejs_compat` features (DNS, certain TLS APIs) only activate if `compatibility_date` is `2024-09-23` or later. The bootstrapped `wrangler.jsonc` may carry an older date from the starter template.
- **OpenRouter tail latency is unbounded** — OpenRouter routes across underlying providers. Median latency may be 5–10s, but p99 for long texts can exceed 30s depending on provider load. Streaming must be the primary design, not an optimization added later.

## Operational Story

- **Preview deploys**: `wrangler deploy --env staging` deploys to a named environment with its own subdomain (`<worker-name>.<account>.workers.dev`). Custom preview domains require Cloudflare Access for protection. For solo MVP development, the default `.workers.dev` subdomain suffices with no additional access controls needed.
- **Secrets**: `wrangler secret put SUPABASE_URL`, `wrangler secret put SUPABASE_KEY`, `wrangler secret put OPENROUTER_API_KEY` — stored in Cloudflare's encrypted secrets vault per Worker, never in source. Secrets are readable only by the Worker at runtime; rotation requires `wrangler secret put` re-run (no downtime).
- **Rollback**: `wrangler rollback` (no arguments) reverts to the previous deployment instantly — typically under 5 seconds globally. `wrangler rollback <VERSION_ID>` targets a specific prior version. Rollback does not undo database migrations (Supabase-side changes are independent and do not automatically revert).
- **Approval**: `wrangler deploy` and `wrangler rollback` may run unattended by an agent. Secret rotation (`wrangler secret put`) requires the `CLOUDFLARE_API_TOKEN` environment variable — a human must provision this token. Billing-tier changes require dashboard access.
- **Logs**: `wrangler tail` streams live logs (JSON or pretty-printed, filterable by status, method, or search string). `wrangler tail --format json` provides machine-readable output for agent parsing. Historical logs are available in the Cloudflare dashboard or via the Logpush API (paid feature).

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Auth fails in production due to missing `nodejs_compat` flag | Unknown unknowns | High | High | Add `"nodejs_compat"` to `compatibility_flags` and set `compatibility_date = "2024-09-23"` in `wrangler.jsonc` before first deploy. Verify with `wrangler dev` using `--remote` flag. |
| `wrangler.toml` shadows `wrangler.jsonc`, silently ignoring config | Unknown unknowns | Medium | High | Audit the project root for both files before deploying. Delete any stale `.toml` if `.jsonc` is the authoritative config. |
| AI generation timeouts for long prompts (>30s wall-clock) | Devil's advocate / Pre-mortem | Medium | High | Implement streaming responses using `ReadableStream` from the first version of the AI generation endpoint. Do not buffer the full OpenRouter response. |
| `deployment_target: cloudflare-pages` in tech-stack.md causes stale tutorial confusion | Research finding | High | Medium | Update `tech-stack.md` `deployment_target` to `cloudflare-workers`. Add a note in CLAUDE.md that Pages adapter was removed in Astro 6. |
| Per-Worker daily billing on paid plan (activated May 26, 2026) | Research finding | High | Low | MVP will operate on the free tier (100k requests/day included). If upgrading to paid, account for per-Worker daily idle charge. |
| OpenRouter p99 latency exceeds 30-second Workers limit | Pre-mortem | Low | High | Set a 25-second client-side timeout for OpenRouter calls; return a partial or error response. Use streaming so users see progress before the timeout. |
| `compatibility_date` too old to enable required `nodejs_compat` features | Unknown unknowns | Medium | Medium | Ensure `wrangler.jsonc` sets `compatibility_date` to `2024-09-23` or later. |

## Getting Started

1. **Verify `wrangler.jsonc` has the Workers adapter config:**
   ```jsonc
   {
     "name": "10xcards",
     "main": "dist/_worker.js/index.js",
     "compatibility_date": "2024-09-23",
     "compatibility_flags": ["nodejs_compat"],
     "assets": { "directory": "dist" }
   }
   ```
   The `nodejs_compat` flag and `compatibility_date ≥ 2024-09-23` are required for Supabase PKCE auth to work in production.

2. **Install Wrangler globally if not present:**
   ```bash
   npm install -g wrangler
   wrangler --version
   ```

3. **Authenticate with Cloudflare:**
   ```bash
   wrangler login
   ```

4. **Set secrets for the Worker:**
   ```bash
   wrangler secret put SUPABASE_URL
   wrangler secret put SUPABASE_KEY
   wrangler secret put OPENROUTER_API_KEY
   ```

5. **Build and deploy:**
   ```bash
   npm run build
   wrangler deploy
   ```
   The CLI returns the deployed Worker URL. Tail live logs with `wrangler tail`.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup (GitHub Actions wiring)
- Production-scale architecture (multi-region, HA, DR)
