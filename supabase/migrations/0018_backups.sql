-- Backups — every night, the whole app in one zip (edge function `backup`).
--
-- The project is on Supabase's free plan, which keeps no backup the office can
-- restore. So the app keeps its own: all data tables as JSON, the schema to
-- rebuild them (much of it was made by hand and is not in these migrations),
-- and every file in storage — the signed PDFs above all. Kept 30 days in the
-- private `backups` bucket; a copy is emailed weekly (ניהול → גיבויים).
--
-- Left out on purpose: secrets — app_auth (keys, passwords), user_google_tokens
-- and whatsapp_instances (API tokens). A backup travels by email; a secret
-- should not. They are settings, re-entered from ניהול after a restore.
--
-- Everything here runs as the service role only: the functions read every
-- table, so no signed-in session may call them.

-- ── The bucket: no policies, so the app's session cannot reach it ────────────
insert into storage.buckets (id, name, public, file_size_limit)
values ('backups', 'backups', false, 104857600)
on conflict (id) do nothing;

-- ── What gets backed up ──────────────────────────────────────────────────────
create or replace function public.backup_tables()
returns table (name text, row_count bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname not in ('app_auth', 'user_google_tokens', 'whatsapp_instances')
    order by c.relname
  loop
    name := t.relname;
    execute format('select count(*) from public.%I', t.relname) into row_count;
    return next;
  end loop;
end
$$;

-- One table's rows as a JSON array, in one call — no 1,000-row page limit.
create or replace function public.backup_table_json(t text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  out text;
begin
  if t in ('app_auth', 'user_google_tokens', 'whatsapp_instances')
     or not exists (
       select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and c.relname = t
     ) then
    raise exception 'not a backed-up table: %', t;
  end if;
  execute format('select coalesce(json_agg(x), ''[]''::json)::text from public.%I x', t) into out;
  return out;
end
$$;

-- Every stored file except the backups themselves.
create or replace function public.backup_files()
returns table (bucket text, name text, size bigint)
language sql
security definer
set search_path = public, storage
as $$
  select o.bucket_id, o.name, coalesce((o.metadata ->> 'size')::bigint, 0)
  from storage.objects o
  where o.bucket_id <> 'backups'
  order by o.bucket_id, o.name
$$;

-- The schema as SQL: sequences, tables, constraints, indexes, RLS, policies and
-- the app's own functions — enough to rebuild an empty copy to load data into.
create or replace function public.backup_schema()
returns text
language sql
security definer
set search_path = public
as $$
  with tbl as (
    select c.oid, c.relname, c.relrowsecurity
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
  ),
  cols as (
    select t.relname,
           string_agg(
             format('  %I %s%s%s',
                    a.attname,
                    format_type(a.atttypid, a.atttypmod),
                    case when d.adbin is not null then ' default ' || pg_get_expr(d.adbin, d.adrelid) else '' end,
                    case when a.attnotnull then ' not null' else '' end),
             E',\n' order by a.attnum) as body
    from tbl t
    join pg_attribute a on a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    group by t.relname
  )
  select concat_ws(E'\n\n',
    '-- R.E.S — schema of the public tables, taken with the backup.',
    (select string_agg(format('create sequence if not exists public.%I;', c.relname), E'\n' order by c.relname)
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'S'),
    (select string_agg(format(E'create table if not exists public.%I (\n%s\n);', relname, body), E'\n\n' order by relname) from cols),
    (select string_agg(format('alter table public.%I add constraint %I %s;', t.relname, con.conname, pg_get_constraintdef(con.oid)),
                       E'\n' order by case con.contype when 'p' then 0 when 'u' then 1 when 'c' then 2 else 3 end, t.relname, con.conname)
       from tbl t join pg_constraint con on con.conrelid = t.oid),
    (select string_agg(i.indexdef || ';', E'\n' order by i.tablename, i.indexname)
       from pg_indexes i
       where i.schemaname = 'public'
         and not exists (select 1 from pg_constraint con where con.conname = i.indexname)),
    (select string_agg(format('alter table public.%I enable row level security;', relname), E'\n' order by relname)
       from tbl where relrowsecurity),
    (select string_agg(
              format('create policy %I on %I.%I as %s for %s to %s%s%s;',
                     p.policyname, p.schemaname, p.tablename, p.permissive, p.cmd,
                     array_to_string(p.roles, ', '),
                     case when p.qual is not null then ' using (' || p.qual || ')' else '' end,
                     case when p.with_check is not null then ' with check (' || p.with_check || ')' else '' end),
              E'\n' order by p.schemaname, p.tablename, p.policyname)
       from pg_policies p where p.schemaname in ('public', 'storage')),
    (select string_agg(pg_get_functiondef(f.oid) || ';', E'\n\n' order by f.proname)
       from pg_proc f join pg_namespace n on n.oid = f.pronamespace
       where n.nspname = 'public' and f.prokind = 'f'
         and not exists (select 1 from pg_depend dep where dep.objid = f.oid and dep.deptype = 'e'))
  )
$$;

revoke all on function public.backup_tables() from public, anon, authenticated;
revoke all on function public.backup_table_json(text) from public, anon, authenticated;
revoke all on function public.backup_files() from public, anon, authenticated;
revoke all on function public.backup_schema() from public, anon, authenticated;
grant execute on function public.backup_tables() to service_role;
grant execute on function public.backup_table_json(text) to service_role;
grant execute on function public.backup_files() to service_role;
grant execute on function public.backup_schema() to service_role;

-- ── The nightly run ──────────────────────────────────────────────────────────
-- The cron call carries its own token (the function is verify_jwt false, like
-- sync-meetings). 23:30 UTC = 02:30 Israel in summer, 01:30 in winter; on the
-- night into Sunday the function also emails the weekly copy.
insert into public.app_auth (key, value)
values ('backup_token', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;

select cron.unschedule(jobid) from cron.job where jobname = 'backup-nightly';
select cron.schedule(
  'backup-nightly',
  '30 23 * * *',
  $cron$
  select net.http_post(
    url := 'https://uhmzdhtjabhbcyslovfk.supabase.co/functions/v1/backup?t=' || (select value from app_auth where key = 'backup_token'),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"action": "run", "scheduled": true}'::jsonb,
    timeout_milliseconds := 150000
  )
  $cron$
);
