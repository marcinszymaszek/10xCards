import { describe, expect, it } from "vitest";
import { POST } from "@/pages/api/drafts/promote";
import { buildContext } from "@/test/handler";

// Risk #1 / #6 cheap layer: the promote handler's request guards return a 4xx
// *before* the `promote_generation_session` RPC, so they need no database. The
// integrity behaviors that require a real transaction (exactly-once,
// partitioning, idempotency) live in `src/test/integration/promote.integration.test.ts`.
const VALID_SESSION = "00000000-0000-0000-0000-0000000000aa";
const VALID_CARD = { id: "00000000-0000-0000-0000-0000000000bb", front: "Q", back: "A" };

describe("POST /api/drafts/promote — request guards (no DB)", () => {
  it("rejects an unauthenticated request with 401", async () => {
    const res = await POST(buildContext({ user: null, body: { session_id: VALID_SESSION, accepted: [VALID_CARD] } }));
    expect(res.status).toBe(401);
  });

  it("rejects a malformed JSON body with 400", async () => {
    const res = await POST(buildContext({ rawBody: "{ not json" }));
    expect(res.status).toBe(400);
  });

  it("rejects a missing session_id with 400", async () => {
    const res = await POST(buildContext({ body: { accepted: [VALID_CARD] } }));
    expect(res.status).toBe(400);
  });

  it("rejects an empty session_id with 400", async () => {
    const res = await POST(buildContext({ body: { session_id: "", accepted: [VALID_CARD] } }));
    expect(res.status).toBe(400);
  });

  it("rejects a non-array accepted payload with 400", async () => {
    const res = await POST(buildContext({ body: { session_id: VALID_SESSION, accepted: "nope" } }));
    expect(res.status).toBe(400);
  });

  it("rejects an accepted element with the wrong shape with 400", async () => {
    const res = await POST(buildContext({ body: { session_id: VALID_SESSION, accepted: [{ id: "d1", front: "Q" }] } }));
    expect(res.status).toBe(400);
  });
});
