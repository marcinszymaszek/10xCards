# Cloudflare Workers — First Deploy Plan

**Project:** 10xCards  
**Platform:** Cloudflare Workers (via `@astrojs/cloudflare` adapter)  
**Plan date:** 2026-06-02  
**Source:** `context/foundation/infrastructure.md`

---

## Pre-flight checklist (automated — no mutations)

- [x] `wrangler.jsonc` uses `"main": "@astrojs/cloudflare/entrypoints/server"` — correct Astro 6 Workers entrypoint
- [x] `compatibility_date: "2026-05-08"` — well past the 2024-09-23 threshold required for `nodejs_compat`
- [x] `compatibility_flags: ["nodejs_compat"]` — present; required for Supabase PKCE (`node:crypto`)
- [x] `assets.directory: "./dist"` — correct for Astro build output
- [x] No `wrangler.toml` found — no silent config shadowing risk
- [x] `@astrojs/cloudflare@^13.5.0` in dependencies — correct adapter for Astro 6 Workers
- [x] `wrangler@^4.90.0` in devDependencies — CLI available locally via `npx wrangler`
- [x] Supabase client nullable guard present in `src/lib/supabase.ts` — safe when env vars absent at build time
- [x] `SUPABASE_URL` and `SUPABASE_KEY` marked `optional: true` in `astro:env` schema — build does not fail without them

---

## Phase 1 — Local dev secrets [HUMAN GATE]

> **Why:** Cloudflare's local `workerd` dev runtime reads secrets from `.dev.vars`, NOT `.env`.
> Without this file, `npm run dev` runs against a Cloudflare runtime that has no Supabase credentials,
> causing silent auth failures that look different from production. Getting this right prevents
> a dev/prod parity gap from day one.

- [ ] Copy the example file:
  ```bash
  cp .env.example .dev.vars
  ```
- [ ] Populate `.dev.vars` with real Supabase credentials:
  ```
  SUPABASE_URL=https://<project-ref>.supabase.co
  SUPABASE_KEY=<anon-key>
  ```
- [ ] Confirm `.dev.vars` is in `.gitignore` — it must never be committed

  **Edge case — `.dev.vars` not in `.gitignore`:**
  ```bash
  grep ".dev.vars" .gitignore || echo ".dev.vars" >> .gitignore
  ```

- [ ] Verify local dev works end-to-end:
  ```bash
  npm run dev
  # open http://localhost:4321/auth/signin and confirm sign-in renders
  ```

---

## Phase 2 — Cloudflare account authentication [HUMAN GATE]

> **Why:** `wrangler login` opens a browser OAuth flow — this cannot be automated.
> The resulting token is cached in `~/.wrangler/config/default.toml` and used by
> all subsequent `wrangler` commands.

- [ ] Authenticate with Cloudflare:
  ```bash
  npx wrangler login
  ```
- [ ] Confirm authentication succeeded:
  ```bash
  npx wrangler whoami
  # should print your account name and account ID
  ```

  **Edge case — already logged in with a different account:**
  ```bash
  npx wrangler logout
  npx wrangler login
  ```

  **Edge case — SSO / org account:**
  If your Cloudflare account is behind an org SSO, the browser OAuth may time out.
  Use an API token instead:
  1. Go to Cloudflare dashboard → My Profile → API Tokens → Create Token
  2. Use the "Edit Cloudflare Workers" template
  3. Set `CLOUDFLARE_API_TOKEN=<token>` in your shell before running wrangler commands

---

## Phase 3 — Set production secrets [HUMAN GATE]

> **Why:** `wrangler secret put` uploads encrypted secrets to Cloudflare's vault.
> They are only accessible to the Worker at runtime — never in source, never in logs.
> Each command prompts for the value interactively; nothing is echoed to the terminal.

- [x] Set Supabase URL:
  ```bash
  npx wrangler secret put SUPABASE_URL
  ```
- [x] Set Supabase anon key:
  ```bash
  npx wrangler secret put SUPABASE_KEY
  ```
- [x] Verify secrets are registered (does not reveal values):
  ```bash
  npx wrangler secret list
  # confirmed: SUPABASE_URL, SUPABASE_KEY — both present
  ```

  **Note — OPENROUTER_API_KEY:**
  AI generation (FR-003/FR-004) is not yet implemented. Add this secret before
  implementing the AI endpoint:
  ```bash
  npx wrangler secret put OPENROUTER_API_KEY
  ```

  **Edge case — secret update:**
  Re-running `wrangler secret put` with the same name overwrites the previous value
  with zero downtime.

---

## Phase 4 — First production build and deploy [AGENT]

- [x] Run a clean production build:
  ```bash
  npm run build
  ```
  Build requires `SUPABASE_URL` and `SUPABASE_KEY` in `.env` (not `.dev.vars`) for
  the local build step. If build fails with missing env vars:
  ```bash
  cp .env.example .env
  # populate .env with real values, then re-run npm run build
  ```

  **Edge case — `npx astro sync` needed:**
  If the build fails with type errors in `.astro/types.d.ts`:
  ```bash
  npx astro sync && npm run build
  ```

- [x] Deploy to Cloudflare Workers:
  ```bash
  npx wrangler deploy
  ```
  Expected output: `Deployed 10xcards ... https://10xcards.<account>.workers.dev`

  **Note:** Wrangler auto-provisioned KV Namespace `10xcards-session` for session binding during first deploy.

- [x] Capture and record the deployed URL:
  ```
  Deployed URL: https://10xcards.marcinszymaszek8.workers.dev
  ```
  Version ID: 1934898f-ac1d-4dc6-afc3-b49b935e0061 (2026-06-02)

---

## Phase 5 — Smoke test [HUMAN + AGENT]

> Test the golden path end-to-end on the deployed `.workers.dev` URL.

- [x] Homepage loads without errors (`/`) — HTTP 200
- [x] `/auth/signin` renders sign-in form — HTTP 200
- [x] `/auth/signup` renders sign-up form — HTTP 200
- [x] Pages load without "Supabase not configured" warning
- [x] Attempt sign-up with a test email — account is created in Supabase
- [x] Sign in with the test account — session is established
- [x] `/dashboard` is accessible when authenticated
- [x] `/dashboard` redirects to `/auth/signin` when not authenticated — HTTP 302 confirmed
- [x] Sign out — session is cleared, `/dashboard` redirects again

  **Edge case — PKCE auth fails in production (500 on sign-in/sign-up):**
  This means `nodejs_compat` is not active. Verify the wrangler.jsonc flags:
  ```bash
  npx wrangler deploy --dry-run --outdir=dist-check
  # inspect dist-check/_worker.js for any build errors
  ```
  Then confirm the deployed Worker has the flag:
  ```bash
  npx wrangler deployments list
  # check the deployment metadata includes nodejs_compat
  ```

  **Edge case — 500 errors with no logs:**
  Stream live logs while reproducing:
  ```bash
  npx wrangler tail --format pretty
  ```
  For machine-readable output:
  ```bash
  npx wrangler tail --format json
  ```

---

## Phase 6 — CI/CD wiring [HUMAN GATE + AGENT]

> Wire GitHub Actions to auto-deploy on push to `master`.

### 6a — Create a scoped Cloudflare API token [HUMAN GATE]

1. Go to **Cloudflare Dashboard → My Profile → API Tokens → Create Token**
2. Use the **"Edit Cloudflare Workers"** template (includes Workers Scripts: Edit + Assets: Edit)
3. Scope to: **Account = your account**, **Zone Resources = All zones** (or no zone if Workers-only)
4. Copy the token value — it is shown only once

### 6b — Add secrets to GitHub repository [HUMAN GATE]

Go to **GitHub → repo → Settings → Secrets and variables → Actions → New repository secret**:

| Secret name | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Token from step 6a |
| `CLOUDFLARE_ACCOUNT_ID` | Found on Cloudflare dashboard right sidebar or via `wrangler whoami` |

`SUPABASE_URL` and `SUPABASE_KEY` are already present in the repo secrets (used by existing CI build step).

### 6c — Add deploy workflow [AGENT]

- [ ] Create `.github/workflows/deploy.yml` with the following content:

```yaml
name: Deploy

on:
  push:
    branches: [master]

jobs:
  deploy:
    runs-on: ubuntu-latest
    needs: []
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx astro sync
      - run: npm run build
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_KEY: ${{ secrets.SUPABASE_KEY }}
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

  **Note:** The existing `ci.yml` runs lint + build on every push and PR.
  The new `deploy.yml` runs only on `master` push, after the build step.
  Keeping them separate means lint failures on PRs don't block deploy logic.

- [ ] Commit and push `deploy.yml` to `master`
- [ ] Confirm the Actions run succeeds: `GitHub → Actions → Deploy`
- [ ] Confirm the live URL still responds after the CI-triggered deploy

---

## Phase 7 — Rollback procedure (reference)

Instant rollback to the previous deployment — no build required:

```bash
npx wrangler rollback
```

Target a specific prior version:

```bash
npx wrangler deployments list          # list versions with IDs
npx wrangler rollback <VERSION_ID>
```

> **Important:** Rollback reverts the Worker code only. Supabase schema migrations
> do NOT automatically revert. If a deploy included a DB migration, coordinate the
> schema rollback separately before rolling back the Worker.

---

## Secrets inventory

| Secret | Where | Status |
|---|---|---|
| `SUPABASE_URL` | Cloudflare Workers vault | Set in Phase 3 |
| `SUPABASE_KEY` | Cloudflare Workers vault | Set in Phase 3 |
| `OPENROUTER_API_KEY` | Cloudflare Workers vault | Deferred — set before AI impl |
| `SUPABASE_URL` | GitHub Actions secrets | Pre-existing (used by CI build) |
| `SUPABASE_KEY` | GitHub Actions secrets | Pre-existing (used by CI build) |
| `CLOUDFLARE_API_TOKEN` | GitHub Actions secrets | Set in Phase 6b |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub Actions secrets | Set in Phase 6b |

---

## Risk register (deploy-time)

| Risk | Likelihood | Mitigation |
|---|---|---|
| `.dev.vars` missing → local auth silent failures | High | Phase 1: copy `.env.example` → `.dev.vars` |
| `.dev.vars` committed to git | Medium | Phase 1: verify `.gitignore` entry |
| PKCE auth 500s in production (`nodejs_compat` absent) | Low — already in config | Smoke test Phase 5; check `wrangler deployments list` |
| `wrangler.toml` shadowing `wrangler.jsonc` | Low — no `.toml` found | Pre-flight confirmed clean; re-check if adding any tool |
| AI generation timeout >30s (not yet implemented) | Future | Wire streaming `ReadableStream` from first AI endpoint commit |
| CI deploy fails due to missing GitHub secrets | Medium | Phase 6b checklist; confirm both `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` |
