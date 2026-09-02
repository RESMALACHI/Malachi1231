-- ============================================================================
-- Meeting Tracker — initial schema
-- Run this in the Supabase SQL Editor (or via `supabase db push`).
-- ============================================================================

-- gen_random_uuid() lives in pgcrypto (preinstalled on Supabase).
create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- profiles: one row per auth user, holds display name + role.
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text,
  role       text not null default 'agent' check (role in ('agent', 'admin')),
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- meetings: calendar-sourced meetings with manually-reported status/type.
-- google_event_id is unique so re-syncing never duplicates a meeting and never
-- overwrites a row the agent already updated.
-- NOTE: if multiple agents could share a calendar event, swap the UNIQUE below
--       for: unique (agent_id, google_event_id)
-- ----------------------------------------------------------------------------
create table if not exists public.meetings (
  id              uuid primary key default gen_random_uuid(),
  agent_id        uuid not null references public.profiles (id) on delete cascade,
  google_event_id text unique,
  title           text,
  meeting_date    timestamptz,
  status          text not null default 'pending'
                    check (status in ('pending', 'attended', 'no_show')),
  type            text not null default 'frontal'
                    check (type in ('zoom', 'frontal')),
  created_at      timestamptz not null default now()
);

create index if not exists meetings_agent_date_idx
  on public.meetings (agent_id, meeting_date);

-- ----------------------------------------------------------------------------
-- Helper: is the current user an admin? (SECURITY DEFINER avoids RLS recursion
-- when a meetings policy needs to look at the caller's profile role.)
-- ----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ----------------------------------------------------------------------------
-- Auto-create a profile whenever a new auth user signs up.
-- full_name is taken from Google's OAuth metadata.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    ),
    'agent'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.meetings enable row level security;

-- profiles -------------------------------------------------------------------
drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own"
  on public.profiles for select
  using (id = auth.uid());

drop policy if exists "profiles: admins read all" on public.profiles;
create policy "profiles: admins read all"
  on public.profiles for select
  using (public.is_admin());

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- The trigger inserts profiles, but allow self-insert as a fallback.
drop policy if exists "profiles: insert own" on public.profiles;
create policy "profiles: insert own"
  on public.profiles for insert
  with check (id = auth.uid());

-- meetings -------------------------------------------------------------------
drop policy if exists "meetings: agent reads own" on public.meetings;
create policy "meetings: agent reads own"
  on public.meetings for select
  using (agent_id = auth.uid());

drop policy if exists "meetings: admins read all" on public.meetings;
create policy "meetings: admins read all"
  on public.meetings for select
  using (public.is_admin());

drop policy if exists "meetings: agent inserts own" on public.meetings;
create policy "meetings: agent inserts own"
  on public.meetings for insert
  with check (agent_id = auth.uid());

drop policy if exists "meetings: agent updates own" on public.meetings;
create policy "meetings: agent updates own"
  on public.meetings for update
  using (agent_id = auth.uid())
  with check (agent_id = auth.uid());

-- Lets the sync remove meetings whose Google Calendar event was deleted.
drop policy if exists "meetings: agent deletes own" on public.meetings;
create policy "meetings: agent deletes own"
  on public.meetings for delete
  using (agent_id = auth.uid());

-- ============================================================================
-- After your first login, promote yourself to admin to see the admin view:
--   update public.profiles set role = 'admin' where id = '<your-user-uuid>';
-- ============================================================================
