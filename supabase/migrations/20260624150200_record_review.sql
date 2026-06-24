CREATE OR REPLACE FUNCTION record_review(
  p_flashcard_id    UUID,
  p_due             TIMESTAMPTZ,
  p_stability       DOUBLE PRECISION,
  p_difficulty      DOUBLE PRECISION,
  p_elapsed_days    INTEGER,
  p_scheduled_days  INTEGER,
  p_learning_steps  INTEGER,
  p_reps            INTEGER,
  p_lapses          INTEGER,
  p_state           TEXT,
  p_last_review     TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  -- review_states.flashcard_id is not itself RLS-scoped, so unlike every
  -- other RPC in this schema, ownership of the target flashcard must be
  -- checked explicitly before writing — otherwise a caller could upsert a
  -- schedule row against a flashcard_id they don't own.
  IF NOT EXISTS (
    SELECT 1 FROM flashcards
    WHERE id = p_flashcard_id
      AND user_id = auth.uid()
  ) THEN
    RETURN;
  END IF;

  INSERT INTO review_states (
    user_id, flashcard_id, due, stability, difficulty,
    elapsed_days, scheduled_days, learning_steps, reps, lapses,
    state, last_review
  )
  VALUES (
    auth.uid(), p_flashcard_id, p_due, p_stability, p_difficulty,
    p_elapsed_days, p_scheduled_days, p_learning_steps, p_reps, p_lapses,
    p_state, p_last_review
  )
  ON CONFLICT (user_id, flashcard_id) DO UPDATE SET
    due             = EXCLUDED.due,
    stability       = EXCLUDED.stability,
    difficulty      = EXCLUDED.difficulty,
    elapsed_days    = EXCLUDED.elapsed_days,
    scheduled_days  = EXCLUDED.scheduled_days,
    learning_steps  = EXCLUDED.learning_steps,
    reps            = EXCLUDED.reps,
    lapses          = EXCLUDED.lapses,
    state           = EXCLUDED.state,
    last_review     = EXCLUDED.last_review;
END;
$$;
