# Repository Guidelines

10xCards is an AI-powered flashcard web app (Astro 6 SSR + React 19 islands, Supabase auth, Cloudflare Workers). @README.md covers full setup and deployment; @context/foundation/prd.md has product requirements.

## Hard Rules

- **React Compiler is mandatory.** `react-compiler/react-compiler` is an ESLint `error` — every React component must pass React 19 Compiler checks.
- **Supabase client is nullable.** `createSupabaseServerClient()` returns `null` without env vars — always guard before use.
- **Route protection lives in middleware.** Add protected paths to `PROTECTED_ROUTES` in `@src/middleware.ts`, not in page files.
- **Vite is pinned to `^7.3.2`.** Do not remove or upgrade this override in `package.json` when updating deps.
- **AI generation not yet implemented.** FR-003/FR-004 (Claude API) are pending — do not add SDK calls unless explicitly tasked.
- **Secrets are server-only.** `SUPABASE_URL` and `SUPABASE_KEY` (declared via `astro:env`) must never be referenced in client-side code.

## Project Structure

- `src/components/auth/` — React auth forms (SignInForm, SignUpForm, FormField, PasswordToggle, ServerError)
- `src/components/ui/` — shadcn-style primitives (Button, etc.)
- `src/lib/` — `supabase.ts` (nullable client factory), `utils.ts` (`cn()` helper)
- `src/pages/api/auth/` — server-side auth endpoints (signin, signout, signup)
- `src/middleware.ts` — session injection + PROTECTED_ROUTES guard
- `context/foundation/` — PRD, tech-stack notes

Use `@/` for all imports from `src/` (alias resolves to `./src/*`).

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Dev server (Cloudflare workerd runtime) |
| `npm run lint` | Type-aware ESLint — runs tsc, slow |
| `npm run lint:fix` | Auto-fix ESLint + Prettier |
| `npm run build` | Production build — requires `SUPABASE_URL` + `SUPABASE_KEY` |
| `npx astro sync` | Regenerate `.astro/types.d.ts` when imports break |

Before first build: copy `.env.example` → `.env` and `.dev.vars`; populate both with Supabase credentials.

## Style & Conventions

- TypeScript strict mode via `astro/tsconfigs/strict`; see `@tsconfig.json`.
- Prettier: 120-char line width, double quotes, 2-space indent; see `@.prettierrc.json`.
- Tailwind v4 uses the Vite plugin — no PostCSS. Class conditionals go through `cn()` from `@/lib/utils`.
- ESLint 9 flat config; see `@eslint.config.js`. Pre-commit gate (Husky + lint-staged) blocks commits on lint failure — run `npm run lint:fix` first.

## Testing

No test framework configured. The pre-commit lint gate is the only automated quality check.

## Security

- Local: populate `.env` and `.dev.vars` from `.env.example`. Production: set via Cloudflare dashboard or `npx wrangler secret put`. CI: set as GitHub repository secrets.
