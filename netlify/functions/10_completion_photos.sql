-- ============================================================
-- 10_completion_photos.sql
-- Allow up to 5 photos per sub-task completion (was a single
-- proof_image_url). The old single-URL column is kept for
-- backward compatibility; new uploads populate the array.
-- Run this in the Supabase SQL editor.
-- ============================================================

alter table public.ops_completions
  add column if not exists proof_images jsonb not null default '[]'::jsonb;

-- Each element is a public URL string. Max 5 enforced in the app UI.
-- Existing rows keep their single proof_image_url; the app shows both
-- (proof_image_url first if present, then any proof_images).
