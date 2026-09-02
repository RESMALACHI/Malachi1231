-- ============================================================================
-- App-wide settings (control panel). Single key/value store shared by everyone.
-- Currently holds the 'nav' key: { hidden: ["tasks", …] } — pages hidden from
-- the navigation. Any authenticated user may read/write (the panel is PIN-gated
-- in the UI), same shared-tool model as the rest of the app.
-- ============================================================================

create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

drop policy if exists "app_settings: authenticated read" on public.app_settings;
create policy "app_settings: authenticated read"
  on public.app_settings for select
  using (auth.uid() is not null);

drop policy if exists "app_settings: authenticated insert" on public.app_settings;
create policy "app_settings: authenticated insert"
  on public.app_settings for insert
  with check (auth.uid() is not null);

drop policy if exists "app_settings: authenticated update" on public.app_settings;
create policy "app_settings: authenticated update"
  on public.app_settings for update
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

insert into public.app_settings (key, value)
values ('nav', '{"hidden": []}'::jsonb)
on conflict (key) do nothing;
