-- ============================================================
-- 08_submissions.sql
-- Submission history for franchisee task assignments.
-- Every time a franchisee submits (or resubmits after a reject),
-- one immutable row is appended here. This preserves the full
-- evidence trail: what was sent, when, and HQ's feedback on it.
-- Run this in the Supabase SQL editor.
-- ============================================================

create table if not exists public.ops_submissions (
  id                uuid primary key default gen_random_uuid(),
  ops_assignment_id uuid not null references public.ops_assignments(id) on delete cascade,
  franchisee_id     uuid not null references public.franchisees(id) on delete cascade,
  attempt_no        int  not null default 1,          -- 1 = first submit, 2 = first resubmit, ...
  note              text,                              -- franchisee's message with this submission
  photos            jsonb not null default '[]'::jsonb,-- array of storage public URLs (max 5)
  submitted_at      timestamptz not null default now(),
  -- HQ review of THIS specific submission (filled when HQ acts on it):
  review_status     text,                              -- 'approved' | 'rejected' | null (pending)
  hq_feedback       text,                              -- HQ's reason when rejected
  reviewed_at       timestamptz,
  reviewed_by       uuid                               -- HQ profile id who reviewed
);

create index if not exists idx_ops_submissions_assignment
  on public.ops_submissions(ops_assignment_id, attempt_no);
create index if not exists idx_ops_submissions_franchisee
  on public.ops_submissions(franchisee_id);

-- ---------- Row Level Security ----------
alter table public.ops_submissions enable row level security;

-- Franchisees can read their own submission history.
drop policy if exists sub_select_own on public.ops_submissions;
create policy sub_select_own on public.ops_submissions
  for select using (
    franchisee_id in (
      select franchisee_id from public.profiles where id = auth.uid()
    )
  );

-- Franchisees can INSERT their own submissions (append-only evidence).
drop policy if exists sub_insert_own on public.ops_submissions;
create policy sub_insert_own on public.ops_submissions
  for insert with check (
    franchisee_id in (
      select franchisee_id from public.profiles where id = auth.uid()
    )
  );

-- HQ (any profile with role 'hq') can read every submission.
drop policy if exists sub_select_hq on public.ops_submissions;
create policy sub_select_hq on public.ops_submissions
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'hq')
  );

-- HQ can UPDATE the review fields (approve/reject a given submission).
drop policy if exists sub_update_hq on public.ops_submissions;
create policy sub_update_hq on public.ops_submissions
  for update using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'hq')
  );

-- NOTE: no UPDATE/DELETE policy for franchisees on purpose.
-- Once submitted, a row is immutable to the franchisee (evidence integrity).

-- ---------- Storage bucket for submission photos ----------
-- If the 'ops-proofs' bucket does not already exist, create it in the
-- Supabase dashboard (Storage > New bucket > name: ops-proofs, Public).
-- Photos are uploaded under: ops-proofs/{franchisee_id}/{assignment_id}/{timestamp}-{n}.jpg
