DROP FUNCTION IF EXISTS get_due_cards();

CREATE FUNCTION get_due_cards()
RETURNS TABLE (
  id              UUID,
  front           TEXT,
  back            TEXT,
  origin          TEXT,
  due             TIMESTAMPTZ,
  stability       DOUBLE PRECISION,
  difficulty      DOUBLE PRECISION,
  elapsed_days    INTEGER,
  scheduled_days  INTEGER,
  learning_steps  INTEGER,
  reps            INTEGER,
  lapses          INTEGER,
  state           TEXT,
  last_review     TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    f.id, f.front, f.back, f.origin,
    rs.due, rs.stability, rs.difficulty, rs.elapsed_days, rs.scheduled_days,
    rs.learning_steps, rs.reps, rs.lapses, rs.state, rs.last_review
  FROM flashcards f
  LEFT JOIN review_states rs
    ON rs.flashcard_id = f.id
   AND rs.user_id = auth.uid()
  WHERE f.user_id = auth.uid()
    AND (rs.id IS NULL OR rs.due <= now())
  ORDER BY COALESCE(rs.due, f.created_at) ASC;
$$;
