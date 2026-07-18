-- ============================================================
-- 12_territory.sql
-- Territory management for the Franchise OS (HQ tool).
-- Stores occupied zip codes and the protection radius so the
-- map + availability checker persists across sessions/devices.
-- Run this in the Supabase SQL editor.
-- ============================================================

-- Occupied zip codes (one row per protected zip).
create table if not exists public.territory_zips (
  zip         text primary key,            -- 5-digit US zip
  label       text,                        -- optional note (store name, owner, etc.)
  created_at  timestamptz not null default now(),
  created_by  uuid                         -- HQ profile id who added it
);

-- Single-row settings (protection radius in miles).
create table if not exists public.territory_settings (
  id            int primary key default 1,
  radius_miles  numeric not null default 5,
  updated_at    timestamptz not null default now(),
  check (id = 1)
);

insert into public.territory_settings (id, radius_miles)
  values (1, 5)
  on conflict (id) do nothing;

-- ---------- Row Level Security (HQ-only) ----------
alter table public.territory_zips enable row level security;
alter table public.territory_settings enable row level security;

-- Only HQ profiles can read/write territory data.
drop policy if exists terr_zips_hq on public.territory_zips;
create policy terr_zips_hq on public.territory_zips
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'hq')
  ) with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'hq')
  );

drop policy if exists terr_settings_hq on public.territory_settings;
create policy terr_settings_hq on public.territory_settings
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'hq')
  ) with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'hq')
  );
