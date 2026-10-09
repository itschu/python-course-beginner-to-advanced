-- Course progress, one row per learner per lesson.
-- Better Auth's own tables ("user", "session", "account", "verification") are
-- created by scripts/migrate.mjs before this file runs.

create table if not exists lesson_progress (
  user_id    text        not null references "user" (id) on delete cascade,
  lesson_key text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_key)
);
