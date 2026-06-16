-- Per-archetype/per-class leaderboard slices (P10-005).
ALTER TABLE leaderboard_runs
  ADD COLUMN IF NOT EXISTS archetype text,
  ADD COLUMN IF NOT EXISTS class_key text;

CREATE INDEX IF NOT EXISTS leaderboard_runs_course_slice_score_idx
  ON leaderboard_runs (course_id, archetype, class_key, verified DESC, score DESC);
