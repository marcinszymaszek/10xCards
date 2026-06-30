import { afterEach, describe, expect, it } from "vitest";
import { POST } from "@/pages/api/generate";
import { buildContext, spyFetch } from "@/test/handler";

// Risk #6 (test-plan §2): over-cap / out-of-range / malformed input must be
// rejected with a 4xx *before* any LLM call. The oracle is behavioral — the
// observable contract is "400 AND the network boundary was never reached" —
// proven with a fetch spy, never by asserting the error-message string (the
// same copy is returned for empty and over-cap text, so the wording is not a
// trustworthy oracle). Each case catches a distinct regression: a future edit
// that moves validation after the fetch, loosens a bound, or drops a guard.

const VALID_TEXT = "Some source text to turn into flashcards.";

describe("POST /api/generate — input validation (Risk #6)", () => {
  afterEach(() => {
    spyFetch().mockRestore();
  });

  describe("rejects invalid input with 400 and never reaches the LLM", () => {
    const rejectCases: { name: string; body?: unknown; rawBody?: string }[] = [
      { name: "empty text", body: { text: "", count: 5 } },
      { name: "non-string text", body: { text: 123, count: 5 } },
      { name: "over-cap text (10001 chars)", body: { text: "a".repeat(10001), count: 5 } },
      { name: "count below minimum (0)", body: { text: VALID_TEXT, count: 0 } },
      { name: "count above maximum (21)", body: { text: VALID_TEXT, count: 21 } },
      { name: "non-integer count (1.5)", body: { text: VALID_TEXT, count: 1.5 } },
      { name: 'string count ("5")', body: { text: VALID_TEXT, count: "5" } },
      { name: "missing count", body: { text: VALID_TEXT } },
      { name: "malformed JSON body", rawBody: "{ not valid json" },
    ];

    for (const { name, body, rawBody } of rejectCases) {
      it(`${name} → 400, fetch not called`, async () => {
        const fetchSpy = spyFetch();
        const res = await POST(buildContext({ body, rawBody }));

        expect(res.status).toBe(400);
        expect(fetchSpy).not.toHaveBeenCalled();
      });
    }
  });

  describe("accepts valid boundaries and reaches the LLM (validation passed)", () => {
    // Positive boundary: valid input must pass validation through to the fetch
    // boundary. The spy throws a marker, so reaching it surfaces as a 500 — we
    // assert fetch was called, proving validation let it through without a DB.
    const boundaryCases: { name: string; body: unknown }[] = [
      { name: "max text length (10000) + min count (1)", body: { text: "a".repeat(10000), count: 1 } },
      { name: "max count (20)", body: { text: VALID_TEXT, count: 20 } },
    ];

    for (const { name, body } of boundaryCases) {
      it(`${name} → validation passes, fetch reached`, async () => {
        const fetchSpy = spyFetch();
        const res = await POST(buildContext({ body }));

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        // The marker thrown by the fetch spy is caught by the handler's
        // generation try/catch → 500. The point is that validation passed.
        expect(res.status).toBe(500);
      });
    }
  });

  it("rejects an unauthenticated request with 401 before reading the body", async () => {
    const fetchSpy = spyFetch();
    const res = await POST(buildContext({ user: null, body: { text: VALID_TEXT, count: 5 } }));

    expect(res.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
