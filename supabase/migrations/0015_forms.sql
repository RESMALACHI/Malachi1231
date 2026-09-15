-- Forms & e-signature (טפסים) — the in-house replacement for iForms.
--
--   form_templates  a PDF the office uploads once, plus the boxes drawn on it
--   form_contacts   the people forms are sent to (imported from iForms)
--   form_requests   one form sent to one person: its values, status, token and,
--                   once signed, the frozen PDF and its SHA-256
--   form_events     the audit trail — created, sent, opened, signed — with time,
--                   IP and device. This, not the drawn signature, is what makes a
--                   signature hold up if it is ever disputed.
--
-- The team reads and writes like every other table here (one shared signed-in
-- account). The CLIENT never touches these tables: the public signing page talks
-- only to the form-sign edge function, which checks the request's token and uses
-- the service role.

create table if not exists public.form_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  source_path text,                       -- storage: the original PDF
  pages       jsonb not null default '[]', -- [{ w, h, image }] — PDF points + page image path
  fields      jsonb not null default '[]', -- boxes, positions relative 0..1 (see lib/formFields.js)
  active      boolean not null default true,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.form_contacts (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  phone       text,
  email       text,
  created_by  text,
  created_at  timestamptz not null default now()
);
create index if not exists form_contacts_name on public.form_contacts (name);
create index if not exists form_contacts_phone on public.form_contacts (phone);

create table if not exists public.form_requests (
  id                uuid primary key default gen_random_uuid(),
  template_id       uuid references public.form_templates(id) on delete set null,
  -- The template AS SENT. Editing a template later must never change a form a
  -- client already has, let alone one they signed.
  template_snapshot jsonb not null,
  template_name     text not null,
  contact_id        uuid references public.form_contacts(id) on delete set null,
  contact_name      text not null,
  contact_phone     text,
  contact_email     text,
  extra_email       text,
  initiator         text,
  status            text not null default 'draft', -- draft | sent | opened | signed | cancelled
  token             text not null unique
                      default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  "values"          jsonb not null default '{}',
  -- The agent's boxes (price, courses…) rendered to PNG when the form is sent.
  -- The signed PDF is stamped with THESE, not with anything the client's
  -- browser sends back, so a client cannot alter the amount they sign for.
  sender_images     jsonb not null default '{}',
  attachments       jsonb not null default '[]',
  signed_at         timestamptz,
  signed_pdf_path   text,
  signed_pdf_sha256 text,
  signer_ip         text,
  signer_ua         text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists form_requests_created on public.form_requests (created_at desc);
create index if not exists form_requests_status on public.form_requests (status);

create table if not exists public.form_events (
  id          bigint generated always as identity primary key,
  request_id  uuid not null references public.form_requests(id) on delete cascade,
  kind        text not null,              -- created | sent | opened | signed | cancelled | resent
  actor       text,                       -- agent name, or 'client'
  ip          text,
  user_agent  text,
  meta        jsonb,
  at          timestamptz not null default now()
);
create index if not exists form_events_request on public.form_events (request_id, at);

alter table public.form_templates enable row level security;
alter table public.form_contacts  enable row level security;
alter table public.form_requests  enable row level security;
alter table public.form_events    enable row level security;

create policy "form_templates: signed in" on public.form_templates for all
  using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "form_contacts: signed in" on public.form_contacts for all
  using (auth.uid() is not null) with check (auth.uid() is not null);
-- A SIGNED request is evidence: readable, never editable or deletable from the
-- app (signing itself goes through the edge function's service role). Only a
-- draft or a cancelled form can be deleted.
create policy "form_requests: read" on public.form_requests for select using (auth.uid() is not null);
create policy "form_requests: add" on public.form_requests for insert with check (auth.uid() is not null);
create policy "form_requests: edit unsigned" on public.form_requests for update
  using (auth.uid() is not null and status <> 'signed')
  with check (auth.uid() is not null and status <> 'signed');
create policy "form_requests: delete drafts" on public.form_requests for delete
  using (auth.uid() is not null and status in ('draft', 'cancelled'));
-- The trail is append-only for the team: it can be read and added to, never
-- edited or deleted from the app.
create policy "form_events: read" on public.form_events for select using (auth.uid() is not null);
create policy "form_events: add" on public.form_events for insert with check (auth.uid() is not null);

-- Private storage: templates, signed PDFs, attachments. Never public — the team
-- reads through signed URLs, the client through the edge function.
insert into storage.buckets (id, name, public)
values ('forms', 'forms', false)
on conflict (id) do nothing;

create policy "forms bucket: team read" on storage.objects for select
  using (bucket_id = 'forms' and auth.uid() is not null);
-- The team writes only templates/. Signed PDFs and attachments are written by
-- the edge function alone, so nothing in the app can overwrite or delete them.
create policy "forms bucket: team write templates" on storage.objects for insert
  with check (bucket_id = 'forms' and auth.uid() is not null and (storage.foldername(name))[1] = 'templates');
create policy "forms bucket: team update templates" on storage.objects for update
  using (bucket_id = 'forms' and auth.uid() is not null and (storage.foldername(name))[1] = 'templates');
create policy "forms bucket: team delete templates" on storage.objects for delete
  using (bucket_id = 'forms' and auth.uid() is not null and (storage.foldername(name))[1] = 'templates');
