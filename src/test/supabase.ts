import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Integration harness for tests that need a real Postgres + RLS (Risk #1
// save-to-deck integrity). These run only against a local Supabase
// (`supabase start`) with the service-role key available; otherwise the suite
// skips (see `isSupabaseReachable`). The service-role key is used to admin-
// create a user, then we sign that user in so `auth.uid()` resolves to them and
// RLS / the promote RPC behave exactly as in production.

const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const admin: SupabaseClient | null = SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
  : null;

/** True only when a local Supabase is up AND a service-role key is configured. */
export async function isSupabaseReachable(): Promise<boolean> {
  if (!SERVICE_ROLE_KEY) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

export interface SeededDraft {
  id: string;
  front: string;
  back: string;
  state: string;
}

export interface TestUserClient {
  /** Authenticated as the freshly-created user — `auth.uid()` resolves to `userId`. */
  client: SupabaseClient;
  userId: string;
  /** Deletes the user (cascades drafts + cards). Call in a `finally`. */
  cleanup: () => Promise<void>;
}

/** Create a unique throwaway user and return a client signed in as them. */
export async function createTestUserClient(): Promise<TestUserClient> {
  if (!admin) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for integration tests");

  const email = `test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
  const password = `pw-${Math.random().toString(36).slice(2)}-A1!`;

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr) throw new Error(`createUser failed: ${createErr.message}`);
  const userId = created.user.id;

  const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
  if (signInErr) throw new Error(`signIn failed: ${signInErr.message}`);

  const cleanup = async () => {
    await admin.auth.admin.deleteUser(userId);
  };

  return { client, userId, cleanup };
}

/** Seed pending (or given-state) drafts for a session; returns the inserted rows. */
export async function seedDrafts(
  client: SupabaseClient,
  userId: string,
  sessionId: string,
  cards: { front: string; back: string; state?: string }[],
): Promise<SeededDraft[]> {
  const rows = cards.map((c) => ({
    user_id: userId,
    front: c.front,
    back: c.back,
    state: c.state ?? "pending",
    generation_session_id: sessionId,
  }));
  const { data, error } = await client.from("flashcard_drafts").insert(rows).select("id, front, back, state");
  if (error) throw new Error(`seedDrafts failed: ${error.message}`);
  return data;
}

/** Re-query the durable deck — never trust the RPC's `saved` count. */
export async function getFlashcards(client: SupabaseClient, userId: string) {
  const { data, error } = await client.from("flashcards").select("id, front, back, origin").eq("user_id", userId);
  if (error) throw new Error(`getFlashcards failed: ${error.message}`);
  return data as { id: string; front: string; back: string; origin: string }[];
}

/** Read back draft states for a session. */
export async function getDraftStates(client: SupabaseClient, sessionId: string) {
  const { data, error } = await client
    .from("flashcard_drafts")
    .select("id, state")
    .eq("generation_session_id", sessionId);
  if (error) throw new Error(`getDraftStates failed: ${error.message}`);
  return data as { id: string; state: string }[];
}
