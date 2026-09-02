-- ============================================================================
-- Unread tracking for the manager ↔ agent chat.
--
-- read_at is stamped when the receiving side opens the conversation; the
-- header bell counts rows where read_at is still null.
-- ============================================================================

alter table public.messages add column if not exists read_at timestamptz;

create index if not exists messages_unread_idx
  on public.messages (agent_name, sender)
  where read_at is null;

-- Needed so the reader can stamp read_at.
drop policy if exists "messages: authenticated update" on public.messages;
create policy "messages: authenticated update"
  on public.messages for update
  using (auth.uid() is not null)
  with check (auth.uid() is not null);
