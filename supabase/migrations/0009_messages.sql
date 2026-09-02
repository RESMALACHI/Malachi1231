-- ============================================================================
-- Manager ↔ agent chat (הודעות מנהל).
--
-- One conversation per agent: every row belongs to the conversation of
-- `agent_name`. `sender` says which side wrote it — the manager (איציק) or the
-- agent. Shared internal tool: any authenticated user may read/write, same as
-- the meetings table.
-- ============================================================================

create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  agent_name text not null,
  sender     text not null check (sender in ('manager', 'agent')),
  body       text not null,
  created_at timestamptz not null default now()
);

create index if not exists messages_agent_created_idx
  on public.messages (agent_name, created_at);

alter table public.messages enable row level security;

drop policy if exists "messages: authenticated read" on public.messages;
create policy "messages: authenticated read"
  on public.messages for select
  using (auth.uid() is not null);

drop policy if exists "messages: authenticated insert" on public.messages;
create policy "messages: authenticated insert"
  on public.messages for insert
  with check (auth.uid() is not null);
