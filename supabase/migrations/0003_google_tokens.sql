-- ============================================================================
-- Stores each user's Google OAuth refresh token so the `google-access-token`
-- Edge Function can mint fresh access tokens without the user re-logging in.
--
-- Security: the client may INSERT/UPDATE only its own row, and there is NO
-- SELECT policy — so refresh tokens can never be read back from the browser.
-- The Edge Function reads them with the service-role key (bypasses RLS).
-- ============================================================================

create table if not exists public.user_google_tokens (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  refresh_token text not null,
  updated_at    timestamptz not null default now()
);

alter table public.user_google_tokens enable row level security;

drop policy if exists "google_tokens: insert own" on public.user_google_tokens;
create policy "google_tokens: insert own"
  on public.user_google_tokens for insert
  with check (user_id = auth.uid());

drop policy if exists "google_tokens: update own" on public.user_google_tokens;
create policy "google_tokens: update own"
  on public.user_google_tokens for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- (Intentionally no SELECT or DELETE policy for clients.)
