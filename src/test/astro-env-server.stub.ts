// Test stub for the `astro:env/server` virtual module. Astro's real module
// resolves secret server vars from `process.env` at runtime; this stub does the
// same, with safe non-empty defaults so `createClient` returns a non-null client
// and the OpenRouter key check passes. No network call is ever made — the
// handler tests spy on `fetch`. Aliased in `vitest.config.ts`.
export const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
export const SUPABASE_KEY = process.env.SUPABASE_KEY ?? "test-anon-key";
export const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? "test-openrouter-key";
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
