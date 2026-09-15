-- History imported from iForms' "ייצוא לאקסל".
--
-- An imported row is a RECORD of a form that lives in iForms — there is no
-- template, token or signed PDF here for it. `source` says where it came from;
-- forms still open in iForms get statuses of their own, so they can never be
-- mistaken for (or acted on as) a form this app sent.
--
--   imported_waiting   ממתין לחתימה in iForms
--   imported_draft     a draft in iForms
--   signed + source 'iforms'   signed in iForms

alter table public.form_requests add column if not exists source text not null default 'app';

-- Imported rows that are not signed may be removed (a mistaken import); a
-- signed one stays, like any signed form.
drop policy if exists "form_requests: delete drafts" on public.form_requests;
create policy "form_requests: delete drafts" on public.form_requests for delete
  using (auth.uid() is not null and status in ('draft', 'cancelled', 'imported_waiting', 'imported_draft'));
