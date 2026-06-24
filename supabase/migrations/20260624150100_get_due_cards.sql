CREATE OR REPLACE FUNCTION get_due_cards()
RETURNS TABLE (id UUID, front TEXT, back TEXT)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT f.id, f.front, f.back
  FROM flashcards f
  LEFT JOIN review_states rs
    ON rs.flashcard_id = f.id
   AND rs.user_id = auth.uid()
  WHERE f.user_id = auth.uid()
    AND (rs.id IS NULL OR rs.due <= now())
  ORDER BY COALESCE(rs.due, f.created_at) ASC;
$$;
