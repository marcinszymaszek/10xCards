---
bootstrapped_at: 2026-05-30T11:05:00Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: 10xcards
language_family: js
package_manager: pnpm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

```yaml
starter_id: 10x-astro-starter
package_manager: pnpm
project_name: 10xcards
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: false
```

**Why this stack:** Solo learner shipping a flashcard MVP in 2 after-hours weeks with email+password auth and an AI generation step. The `(web-app, js)` recommended default is `10x-astro-starter` — Astro 6 + React 19 + TypeScript + Tailwind + Supabase + Cloudflare Pages — and it clears all four agent-friendly gates: fully typed (TypeScript + Zod), strongly convention-based, popular in JS training data, and well-documented. Supabase covers auth (FR-001, FR-002) and PostgreSQL out of the box, removing two integration risks from a tight timeline. The AI generation path (FR-003, FR-004) requires only a TypeScript SDK call — no additional infrastructure. Edge deployment via Cloudflare Pages matches small scale and low QPS. Bootstrapper confidence is first-class: scaffolding is expected to be smooth with occasional manual steps.

## Pre-scaffold verification

| Signal      | Value                                              | Severity | Notes                          |
| ----------- | -------------------------------------------------- | -------- | ------------------------------ |
| npm package | not run                                            | —        | cmd_template is a git clone; npm check skipped |
| GitHub repo | przeprogramowani/10x-astro-starter pushed 2026-05-17 | fresh  | 13 days before bootstrap run   |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && pnpm install`
**Strategy**: git-clone (cloned starter repo; upstream .git/ deleted before move-up)
**Exit code**: 0
**Files moved**: 19 top-level items (including node_modules with 738 packages)
**Conflicts (.scaffold siblings)**: `CLAUDE.md` → `CLAUDE.md.scaffold` (existing course CLAUDE.md preserved)
**.gitignore handling**: append-merged — cwd had `.claude/**/10x-*`; starter's 16 patterns appended under `# from 10x-astro-starter` separator
**.bootstrap-scaffold cleanup**: deleted

## Post-scaffold audit

**Tool**: `npm audit --json`
**Summary**: 0 CRITICAL, 1 HIGH, 9 MODERATE, 0 LOW
**Direct vs transitive**: 0/0 direct CRITICAL/HIGH of total 0/1; all MODERATE findings are transitive (2 packages appear in direct `package.json` but carry only transitive vulnerabilities)

#### CRITICAL findings

None.

#### HIGH findings

| Package  | Version range | Advisory                                           | CVSS | Fix available |
| -------- | ------------- | -------------------------------------------------- | ---- | ------------- |
| devalue  | 5.6.3 – 5.8.0 | Svelte devalue: DoS via sparse array deserialization (GHSA-77vg-94rm-hx3p) | 7.5 | Yes (transitive — pulled via Astro internals) |

#### MODERATE findings

| Package                | isDirect | Via                                              |
| ---------------------- | -------- | ------------------------------------------------ |
| @astrojs/check         | yes      | @astrojs/language-server → volar-service-yaml    |
| @astrojs/language-server | no     | volar-service-yaml → yaml-language-server        |
| @cloudflare/vite-plugin  | no     | miniflare, wrangler, ws                          |
| miniflare              | no       | ws                                               |
| volar-service-yaml     | no       | yaml-language-server                             |
| wrangler               | yes      | miniflare → ws                                   |
| ws                     | no       | ws: Uninitialized memory disclosure (GHSA-58qx-3vcg-4xpx) |
| yaml                   | no       | yaml: Stack Overflow via deeply nested YAML (GHSA-48c2-rrv3-qjmp) |
| yaml-language-server   | no       | yaml                                             |

All MODERATE findings are in dev/toolchain dependencies (@astrojs/check, wrangler, volar) not in production runtime paths. No MODERATE finding affects application code shipped to users.

## Hints recorded but not acted on

| Hint                    | Value            |
| ----------------------- | ---------------- |
| bootstrapper_confidence | first-class      |
| quality_override        | false            |
| path_taken              | standard         |
| self_check_answers      | null             |
| team_size               | solo             |
| deployment_target       | cloudflare-pages |
| ci_provider             | github-actions   |
| ci_default_flow         | auto-deploy-on-merge |
| has_auth                | true             |
| has_payments            | false            |
| has_realtime            | false            |
| has_ai                  | true             |
| has_background_jobs     | false            |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review `CLAUDE.md.scaffold` — the starter ships its own CLAUDE.md; your existing course CLAUDE.md was preserved. Merge anything useful from the scaffold version manually.
- Address audit findings per your project's risk tolerance — the HIGH finding (`devalue` DoS) is transitive through Astro internals; the MODERATE findings are all in dev/toolchain deps. `npm audit fix` may resolve some automatically.
