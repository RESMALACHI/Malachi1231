-- Money an agent adds to their own month's deal bonus, with the reason.
--
-- The deal bonus is otherwise pure arithmetic over the month's deals
-- (src/lib/dealsBonus.js). Some pay doesn't come from that table — a sum agreed
-- for a particular deal, a correction — and until now there was nowhere to put
-- it but a WhatsApp message. An addition is part of the deal bonus: it counts
-- toward the month's total, is subject to the same 10-meeting gate, and goes to
-- accounting in the deals report with its note.
--
-- The note is required: an addition to someone's pay with no reason attached is
-- the one thing accounting cannot act on.

create table if not exists public.deal_bonus_additions (
  id          uuid primary key default gen_random_uuid(),
  agent_name  text not null,
  month       text not null check (month ~ '^\d{4}-\d{2}$'),   -- 'YYYY-MM', the bonus month
  amount      numeric(10, 2) not null check (amount > 0 and amount <= 100000),
  note        text not null check (length(btrim(note)) between 2 and 500),
  created_by  text,
  created_at  timestamptz not null default now()
);

create index if not exists deal_bonus_additions_month_agent on public.deal_bonus_additions (month, agent_name);

alter table public.deal_bonus_additions enable row level security;

create policy "deal_bonus_additions: signed in" on public.deal_bonus_additions for all
  using (auth.uid() is not null) with check (auth.uid() is not null);
