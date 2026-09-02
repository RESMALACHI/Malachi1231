-- Short-link storage for the bot's one-tap client-confirmation links. The full
-- wa.me URL (with the encoded template) lives here; the group message carries
-- only /functions/v1/go?id=... Locked like app_auth: service role only.
create table if not exists wa_links (
  id text primary key,
  url text not null,
  created_at timestamptz not null default now()
);
alter table wa_links enable row level security;
revoke all on wa_links from anon, authenticated;
