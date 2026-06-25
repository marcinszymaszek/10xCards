# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: 10xCards

AI-powered flashcard app. Astro 6 + React 19 islands, Supabase auth (email/password), Cloudflare Workers deployment. Single-developer MVP; AI generation (FR-003/FR-004) not yet implemented.

Key docs: @README.md · @context/foundation/prd.md · @context/foundation/tech-stack.md

## Conventions

- **Import alias:** use `@/` for everything under `src/` (e.g. `@/lib/supabase`, `@/components/auth/SignInForm`)
- **Supabase client is nullable:** `createSupabaseServerClient()` returns `null` when env vars are absent — always guard before use
- **Route protection:** add entries to the `PROTECTED_ROUTES` array in `@src/middleware.ts`, not inside individual pages
- **React Compiler is mandatory:** `react-compiler/react-compiler` is set to ESLint `error` — all React code must pass React 19 Compiler checks
- **Tailwind v4 uses Vite plugin**, not PostCSS — don't add a PostCSS config

## Gotchas

- `pnpm exec astro sync` must run before type checking if `.astro/types.d.ts` is missing or stale
- `pnpm run build` fails without `SUPABASE_URL` and `SUPABASE_KEY` — copy `.env.example` → `.env` and populate
- Pre-commit gate (Husky + lint-staged) blocks commits with lint errors; run `pnpm run lint:fix` first
- Vite is pinned to `^7.3.2` in `package.json` `pnpm.overrides` — don't remove this pin when upgrading deps
- No test framework configured; pre-commit linting is the only automated quality gate
- **Package manager:** pnpm only — do not use `npm` or `yarn`; a `packageManager` field enforces this

## Commands

| Command | Use |
|---------|-----|
| `pnpm run dev` | Astro dev server with Cloudflare workerd runtime |
| `pnpm run lint` | Full type-aware ESLint (slow — runs tsc) |
| `pnpm run lint:fix` | Auto-fix ESLint violations + Prettier format |
| `pnpm run build` | Production build (requires env vars — see Gotchas) |
| `pnpm exec astro sync` | Regenerate Astro types — run if imports break |

---

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 3, Lesson 4 (E2E Tests)

**For E2E tests, use the `/10x-e2e` skill.** It is the single source of truth
for the workflow — risk → seed test + rules → generate → review against the five
anti-patterns → re-prompt → verify. The skill's `references/` carry the full
rules, anti-patterns, seed pattern, and prompt-template.

A few hard rules that hold even before you invoke the skill:

- **Locators:** `getByRole` / `getByLabel` / `getByText` first; `getByTestId`
  only when accessibility attributes are ambiguous. Never CSS selectors, XPath,
  or DOM structure.
- **Never `page.waitForTimeout()`.** Wait for state: `toBeVisible()`,
  `waitForURL()`, `waitForResponse()`.
- **Test independence + cleanup.** Each test runs standalone — its own setup,
  action, assertion, and cleanup; unique ids (timestamp suffix) so parallel runs
  and re-runs don't collide.

Two boundaries to keep straight:

- **DOM (snapshot) is the default.** Vision (`--caps=vision`) is a supplement for
  visual-only risks (layout, z-index, animation); for pixel regression prefer
  deterministic tools (`toMatchSnapshot`, Argos, Lost Pixel). VLM model
  selection/cost is a debugging topic (Lesson 5), not testing.
- **Healer helps on selectors, harms on logic.** A changed selector → healer
  re-finds it (route through PR review). A changed business behavior → healer
  masks the bug; that failing-test-to-fix case is Lesson 5.

<!-- END @przeprogramowani/10x-cli -->
