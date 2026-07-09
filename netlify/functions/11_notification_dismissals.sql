-- ============================================================
-- 11_notification_dismissals.sql
-- Lets a user dismiss individual notifications (bell icon) when
-- they handle the underlying item, instead of only the single
-- "last_seen" marker. The unread badge counts notifications that
-- are newer than last_seen AND not individually dismissed.
-- Run this in the Supabase SQL editor.
-- ============================================================

create table if not exists public.notification_dismissals (
  user_id          uuid not null references auth.users(id) on delete cascade,
  notification_tag text not null,            -- matches notifications.tag (e.g. 'reject-<id>')
  dismissed_at     timestamptz not null default now(),
  primary key (user_id, notification_tag)
);

create index if not exists notif_dismiss_user_idx
  on public.notification_dismissals (user_id);

alter table public.notification_dismissals enable row level security;

-- Each user manages only their own dismissals.
drop policy if exists notif_dismiss_select on public.notification_dismissals;
create policy notif_dismiss_select on public.notification_dismissals
  for select using (user_id = auth.uid());

drop policy if exists notif_dismiss_insert on public.notification_dismissals;
create policy notif_dismiss_insert on public.notification_dismissals
  for insert with check (user_id = auth.uid());

drop policy if exists notif_dismiss_update on public.notification_dismissals;
create policy notif_dismiss_update on public.notification_dismissals
  for update using (user_id = auth.uid());
