import type { APIContext } from "astro";
import { vi } from "vitest";

type TestUser = App.Locals["user"];

interface BuildContextOptions {
  /** Parsed body — serialized to JSON. Ignore when `rawBody` is set. */
  body?: unknown;
  /** Raw request body string — use to exercise malformed-JSON paths. */
  rawBody?: string;
  /** `locals.user`; defaults to a stub authed user. Pass `null` for unauth. */
  user?: TestUser;
  headers?: Record<string, string>;
  url?: string;
  method?: string;
}

const DEFAULT_USER = { id: "00000000-0000-0000-0000-000000000001" } as unknown as TestUser;

/**
 * Build a minimal Astro `APIContext` so an `APIRoute` handler can be invoked
 * directly (`await POST(buildContext(...))`) with no HTTP server. Only the
 * fields the API handlers touch — `request`, `cookies`, `locals` — are real;
 * the rest are stubbed.
 */
export function buildContext(options: BuildContextOptions = {}): APIContext {
  const {
    body,
    rawBody,
    user = DEFAULT_USER,
    headers = {},
    url = "http://localhost/api/test",
    method = "POST",
  } = options;

  const init: RequestInit = { method, headers: { "Content-Type": "application/json", ...headers } };
  if (rawBody !== undefined) {
    init.body = rawBody;
  } else if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  const request = new Request(url, init);

  // Cookies stub — handlers pass it to `createClient`, which only reads the
  // `Cookie` header for the anon client; no cookie operations occur on these
  // code paths.
  const cookies = {
    get: () => undefined,
    getAll: () => [],
    has: () => false,
    set: () => undefined,
    delete: () => undefined,
    merge: () => undefined,
    headers: () => new Headers(),
  };

  return {
    request,
    cookies,
    locals: { user },
  } as unknown as APIContext;
}

/**
 * Install a spy on `globalThis.fetch`. By default it throws a known marker so a
 * test can prove the handler *reached* the network boundary (validation passed)
 * without any real request. Returns the spy; call `.mockRestore()` in cleanup.
 */
export function spyFetch(impl?: typeof fetch) {
  const spy = vi.spyOn(globalThis, "fetch");
  if (impl) {
    spy.mockImplementation(impl);
  } else {
    spy.mockImplementation(() => {
      throw new Error("__FETCH_REACHED__");
    });
  }
  return spy;
}
