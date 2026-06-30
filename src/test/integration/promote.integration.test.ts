import { describe, expect, it } from "vitest";
import { createTestUserClient, getDraftStates, getFlashcards, isSupabaseReachable, seedDrafts } from "@/test/supabase";

// Risk #1 (test-plan §2): save-to-deck integrity. These exercise the real
// `promote_generation_session` RPC against local Postgres + RLS, because
// atomicity and ownership live in the database, not the handler — a mock would
// prove nothing. The suite SKIPS cleanly when local Supabase is unreachable
// (e.g. CI, or no `supabase start`), so it never fails the default run.
//
// The oracle comes from the business contract ("only accepted cards reach the
// deck, exactly once"), NOT from the RPC's `saved` return value — every
// assertion re-queries `flashcards`. Known defects (idempotency, id↔draft
// linkage, missing input caps) are pinned with `it.fails()`: the body asserts
// the CORRECT behavior, so each turns the suite red the moment a future fix
// lands. Fixes are a separate follow-up feature change.

const reachable = await isSupabaseReachable();

describe.skipIf(!reachable)("promote_generation_session — save-to-deck integrity (integration)", () => {
  it("promotes only accepted drafts, exactly once, and partitions the rest", async () => {
    const { client, userId, cleanup } = await createTestUserClient();
    try {
      const sessionId = crypto.randomUUID();
      const seeded = await seedDrafts(client, userId, sessionId, [
        { front: "A-front", back: "A-back" },
        { front: "B-front", back: "B-back" },
        { front: "C-front", back: "C-back" },
      ]);
      const accepted = [seeded[0], seeded[1]].map((d) => ({ id: d.id, front: d.front, back: d.back }));

      const { error } = await client.rpc("promote_generation_session", {
        p_session_id: sessionId,
        p_accepted: accepted,
      });
      expect(error).toBeNull();

      // Deck truth: exactly the two accepted cards, once each.
      const cards = await getFlashcards(client, userId);
      expect(cards).toHaveLength(2);
      expect(cards.map((c) => c.front).sort()).toEqual(["A-front", "B-front"]);

      // Draft partitioning: accepted → accepted, the untouched one → rejected.
      const states = Object.fromEntries((await getDraftStates(client, sessionId)).map((d) => [d.id, d.state]));
      expect(states[seeded[0].id]).toBe("accepted");
      expect(states[seeded[1].id]).toBe("accepted");
      expect(states[seeded[2].id]).toBe("rejected");
    } finally {
      await cleanup();
    }
  });

  it.fails("does not duplicate cards on a double-submit (idempotency — known gap)", async () => {
    const { client, userId, cleanup } = await createTestUserClient();
    try {
      const sessionId = crypto.randomUUID();
      const seeded = await seedDrafts(client, userId, sessionId, [{ front: "X", back: "Y" }]);
      const accepted = seeded.map((d) => ({ id: d.id, front: d.front, back: d.back }));

      await client.rpc("promote_generation_session", { p_session_id: sessionId, p_accepted: accepted });
      await client.rpc("promote_generation_session", { p_session_id: sessionId, p_accepted: accepted });

      // Correct behavior: still exactly one card. Fails today (inserts twice).
      const cards = await getFlashcards(client, userId);
      expect(cards).toHaveLength(1);
    } finally {
      await cleanup();
    }
  });

  it.fails("ignores accepted ids with no matching pending draft (id↔draft linkage — known gap)", async () => {
    const { client, userId, cleanup } = await createTestUserClient();
    try {
      const sessionId = crypto.randomUUID();
      await seedDrafts(client, userId, sessionId, [{ front: "real", back: "real" }]);
      const phantom = [{ id: crypto.randomUUID(), front: "phantom", back: "phantom" }];

      await client.rpc("promote_generation_session", { p_session_id: sessionId, p_accepted: phantom });

      // Correct behavior: a phantom id writes nothing. Fails today (inserted).
      const cards = await getFlashcards(client, userId);
      expect(cards).toHaveLength(0);
    } finally {
      await cleanup();
    }
  });

  it.fails("rejects over-cap promoted content (input-cap parity, Risk #6 on the write path — known gap)", async () => {
    const { client, userId, cleanup } = await createTestUserClient();
    try {
      const sessionId = crypto.randomUUID();
      const seeded = await seedDrafts(client, userId, sessionId, [{ front: "ok", back: "ok" }]);
      const oversized = [{ id: seeded[0].id, front: "a".repeat(100000), back: "ok" }];

      await client.rpc("promote_generation_session", { p_session_id: sessionId, p_accepted: oversized });

      // Correct behavior: an over-cap card is not written. Fails today (no cap).
      const cards = await getFlashcards(client, userId);
      expect(cards.some((c) => c.front.length >= 100000)).toBe(false);
    } finally {
      await cleanup();
    }
  });
});
