-- P11 local platform completion: classroom grading, moderation reports,
-- and explicit dual-use/export-control signoff records for policy sharing.

CREATE TABLE IF NOT EXISTS policy_signoffs (
  id text PRIMARY KEY DEFAULT ('sig-' || substr(encode(gen_random_bytes(8), 'hex'), 1, 16)),
  owner_user_id text REFERENCES users (id) ON DELETE SET NULL,
  target_kind text NOT NULL CHECK (target_kind IN ('marketplace-listing', 'policy-artifact', 'model', 'course')),
  target_id text NOT NULL,
  jurisdiction text NOT NULL DEFAULT 'unspecified',
  policy_version text NOT NULL DEFAULT 'p11-local-2026-06-14',
  status text NOT NULL DEFAULT 'accepted' CHECK (status IN ('accepted', 'blocked', 'revoked')),
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS policy_signoffs_owner_created_idx
  ON policy_signoffs (owner_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS policy_signoffs_target_idx
  ON policy_signoffs (target_kind, target_id);

CREATE TABLE IF NOT EXISTS moderation_reports (
  id text PRIMARY KEY DEFAULT ('mod-' || substr(encode(gen_random_bytes(8), 'hex'), 1, 16)),
  reporter_user_id text REFERENCES users (id) ON DELETE SET NULL,
  target_kind text NOT NULL CHECK (target_kind IN ('listing', 'course', 'share', 'model', 'policy')),
  target_id text NOT NULL,
  reason text NOT NULL CHECK (reason IN ('safety', 'ip', 'spam', 'abuse', 'export-control', 'other')),
  detail text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'triaged', 'actioned', 'rejected')),
  sla_due_at timestamptz NOT NULL DEFAULT (now() + interval '72 hours'),
  repeat_infringer_signal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS moderation_reports_status_due_idx
  ON moderation_reports (status, sla_due_at);
CREATE INDEX IF NOT EXISTS moderation_reports_reporter_created_idx
  ON moderation_reports (reporter_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS moderation_reports_target_idx
  ON moderation_reports (target_kind, target_id);

CREATE TABLE IF NOT EXISTS classroom_assignments (
  id text PRIMARY KEY DEFAULT ('cls-' || substr(encode(gen_random_bytes(8), 'hex'), 1, 16)),
  owner_user_id text REFERENCES users (id) ON DELETE SET NULL,
  course_id text REFERENCES courses (id) ON DELETE SET NULL,
  title text NOT NULL,
  brief text NOT NULL,
  rubric jsonb NOT NULL DEFAULT '{}'::jsonb,
  visibility text NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private', 'unlisted', 'public')),
  due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS classroom_assignments_owner_created_idx
  ON classroom_assignments (owner_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS classroom_assignments_public_created_idx
  ON classroom_assignments (visibility, created_at DESC);

CREATE TABLE IF NOT EXISTS classroom_submissions (
  id text PRIMARY KEY DEFAULT ('sub-' || substr(encode(gen_random_bytes(8), 'hex'), 1, 16)),
  assignment_id text NOT NULL REFERENCES classroom_assignments (id) ON DELETE CASCADE,
  student_user_id text REFERENCES users (id) ON DELETE SET NULL,
  model_id text REFERENCES model_registry (id) ON DELETE SET NULL,
  policy_id text REFERENCES policy_artifacts (id) ON DELETE SET NULL,
  replay_id text REFERENCES replay_artifacts (id) ON DELETE SET NULL,
  contract jsonb,
  validator_report jsonb NOT NULL,
  scorecard jsonb NOT NULL DEFAULT '{}'::jsonb,
  grade jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'graded' CHECK (status IN ('submitted', 'graded', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS classroom_submissions_assignment_created_idx
  ON classroom_submissions (assignment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS classroom_submissions_student_created_idx
  ON classroom_submissions (student_user_id, created_at DESC);
