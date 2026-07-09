-- ============================================================
-- 09_subtask_links.sql
-- Lets HQ attach one or more reference links to a sub-task
-- (e.g. a poster download URL). Stored as a JSON array of
-- {label, url} objects. Run this in the Supabase SQL editor.
-- ============================================================

alter table public.ops_subtasks
  add column if not exists links jsonb not null default '[]'::jsonb;

-- Each element: { "label": "Poster (PDF)", "url": "https://..." }
-- Empty array = no links (default, unchanged behavior).
