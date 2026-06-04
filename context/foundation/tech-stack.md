---
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
---

## Why this stack

Solo learner shipping a flashcard MVP in 2 after-hours weeks with email+password auth and an AI generation step. The `(web-app, js)` recommended default is `10x-astro-starter` — Astro 6 + React 19 + TypeScript + Tailwind + Supabase + Cloudflare Pages — and it clears all four agent-friendly gates: fully typed (TypeScript + Zod), strongly convention-based, popular in JS training data, and well-documented. Supabase covers auth (FR-001, FR-002) and PostgreSQL out of the box, removing two integration risks from a tight timeline. The AI generation path (FR-003, FR-004) requires only a TypeScript SDK call — no additional infrastructure. Edge deployment via Cloudflare Pages matches small scale and low QPS. Bootstrapper confidence is first-class: scaffolding is expected to be smooth with occasional manual steps.
