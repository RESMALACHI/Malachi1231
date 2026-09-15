// טפסים — templates, contacts, sent forms and their audit trail.
//
// The team side talks to Supabase directly (tables + the private "forms"
// bucket). The CLIENT side — the public signing page — goes only through the
// form-sign edge function, keyed by the request's token.

import { supabase } from '../lib/supabaseClient'

const BUCKET = 'forms'

/**
 * Every row of a query, fetched a thousand at a time. Supabase caps one
 * response at 1,000 rows — the office has 3,000+ contacts, and an export or a
 * duplicate check that silently stopped at the first thousand would be wrong
 * without looking wrong.
 */
async function fetchAll(make) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await make().range(from, from + 999)
    if (error) throw error
    out.push(...(data || []))
    if (!data || data.length < 1000) return out
  }
}

// ── Templates ───────────────────────────────────────────────────────────────

export async function listTemplates({ activeOnly = false } = {}) {
  let q = supabase
    .from('form_templates')
    .select('id, name, description, pages, fields, active, created_by, created_at, updated_at, source_path')
    .order('name')
  if (activeOnly) q = q.eq('active', true)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

/** Signed URLs for a template's page images — the bucket is private. */
export async function pageUrls(pages, secs = 3600) {
  const paths = pages.map((p) => p.image).filter(Boolean)
  if (!paths.length) return pages.map((p) => ({ ...p, url: null }))
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, secs)
  if (error) throw error
  const byPath = Object.fromEntries((data || []).map((d) => [d.path, d.signedUrl]))
  return pages.map((p) => ({ ...p, url: byPath[p.image] || null }))
}

/**
 * A new template from a PDF: the original file and one image per page go to
 * storage, the row records their paths and page sizes. `rendered` comes from
 * lib/pdfPages.js.
 */
export async function createTemplate({ name, description, file, rendered, createdBy }) {
  const { data: row, error } = await supabase
    .from('form_templates')
    .insert({ name, description: description || null, created_by: createdBy || null })
    .select()
    .single()
  if (error) throw error

  const base = `templates/${row.id}`
  const up = async (path, body, contentType) => {
    const { error: e } = await supabase.storage.from(BUCKET).upload(path, body, { contentType, upsert: true })
    if (e) throw e
  }
  await up(`${base}/source.pdf`, file, 'application/pdf')
  const pages = []
  for (let i = 0; i < rendered.length; i++) {
    const path = `${base}/page-${i + 1}.jpg`
    await up(path, rendered[i].blob, 'image/jpeg')
    pages.push({ w: rendered[i].w, h: rendered[i].h, image: path })
  }
  const { data: saved, error: e2 } = await supabase
    .from('form_templates')
    .update({ source_path: `${base}/source.pdf`, pages, updated_at: new Date().toISOString() })
    .eq('id', row.id)
    .select()
    .single()
  if (e2) throw e2
  return saved
}

export async function saveTemplate(id, patch) {
  const { data, error } = await supabase
    .from('form_templates')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// ── Contacts ────────────────────────────────────────────────────────────────

/** Digits only, Israeli local form: 972501234567 / +972-50… → 0501234567. */
export function normalizePhone(raw) {
  let d = String(raw || '').replace(/\D/g, '')
  if (d.startsWith('972')) d = `0${d.slice(3)}`
  if (d.length === 9 && d.startsWith('5')) d = `0${d}`
  return d
}

function contactsQuery({ search = '', createdBy = '' }, count = false) {
  let q = supabase
    .from('form_contacts')
    .select('id, name, phone, email, created_by, created_at', count ? { count: 'exact' } : undefined)
    .order('name')
    .order('id') // a total order — paging through ties must not skip or repeat rows
  const s = search.trim()
  if (s) {
    const like = `%${s.replace(/[%,()]/g, ' ')}%`
    const digits = s.replace(/\D/g, '')
    q = q.or(
      [`name.ilike.${like}`, `email.ilike.${like}`, digits.length >= 3 ? `phone.ilike.%${digits}%` : null]
        .filter(Boolean)
        .join(',')
    )
  }
  if (createdBy) q = q.eq('created_by', createdBy)
  return q
}

export async function listContacts({ search = '', createdBy = '', page = 0, pageSize = 50 } = {}) {
  const { data, error, count } = await contactsQuery({ search, createdBy }, true).range(
    page * pageSize,
    page * pageSize + pageSize - 1
  )
  if (error) throw error
  return { rows: data || [], count: count || 0 }
}

/** Every matching contact — for the Excel export. */
export const allContacts = (filters = {}) => fetchAll(() => contactsQuery(filters))

export async function contactCreators() {
  const rows = await fetchAll(() => supabase.from('form_contacts').select('created_by').not('created_by', 'is', null))
  return [...new Set(rows.map((r) => r.created_by))].sort((a, b) => a.localeCompare(b, 'he'))
}

export async function addContact({ name, phone, email, createdBy }) {
  const { data, error } = await supabase
    .from('form_contacts')
    .insert({
      name: name.trim(),
      phone: normalizePhone(phone) || null,
      email: email?.trim() || null,
      created_by: createdBy || null,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateContact(id, { name, phone, email }) {
  const { data, error } = await supabase
    .from('form_contacts')
    .update({ name: name.trim(), phone: normalizePhone(phone) || null, email: email?.trim() || null })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteContact(id) {
  const { error } = await supabase.from('form_contacts').delete().eq('id', id)
  if (error) throw error
}

/**
 * Add many contacts at once (the iForms export). Skips anyone already here by
 * phone — or, without a phone, by name + email — and duplicates inside the file.
 */
export async function importContacts(rows, createdBy) {
  const existing = await fetchAll(() => supabase.from('form_contacts').select('name, phone, email'))
  const key = (r) => (r.phone ? `p:${r.phone}` : `n:${r.name.trim()}|${(r.email || '').toLowerCase()}`)
  const seen = new Set(existing.map((r) => key({ ...r, phone: normalizePhone(r.phone) })))
  const fresh = []
  let skipped = 0
  for (const r of rows) {
    const row = { name: String(r.name || '').trim(), phone: normalizePhone(r.phone) || null, email: String(r.email || '').trim() || null }
    if (!row.name) {
      skipped++
      continue
    }
    const k = key(row)
    if (seen.has(k)) {
      skipped++
      continue
    }
    seen.add(k)
    fresh.push({ ...row, created_by: r.createdBy || createdBy || null })
  }
  for (let i = 0; i < fresh.length; i += 500) {
    const { error: e } = await supabase.from('form_contacts').insert(fresh.slice(i, i + 500))
    if (e) throw e
  }
  return { added: fresh.length, skipped }
}

// ── History imported from iForms ────────────────────────────────────────────

/**
 * iForms' history export → records here. Safe to run again on a newer export:
 * see planHistoryImport. Rows are linked to a contact by phone when the contact
 * list already has them.
 */
export async function importHistory(fileRows) {
  const { identOf, planHistoryImport } = await import('../lib/historyImport')
  const [contacts, existingRaw] = await Promise.all([
    fetchAll(() => supabase.from('form_contacts').select('id, phone').not('phone', 'is', null)),
    fetchAll(() =>
      supabase
        .from('form_requests')
        .select('id, contact_phone, contact_name, status, template_name, created_at')
        .eq('source', 'iforms')
    ),
  ])
  const contactByPhone = new Map(contacts.map((c) => [normalizePhone(c.phone), c.id]))
  const NO_FORM = 'טופס מ-iForms'
  const existing = existingRaw.map((e) => ({
    id: e.id,
    ident: identOf(e.contact_phone, e.contact_name),
    created: e.created_at.slice(0, 10),
    status: e.status,
    template: e.template_name === NO_FORM ? '' : e.template_name,
  }))

  const plan = planHistoryImport(fileRows, existing)
  // 09:00 UTC is midday in Israel whatever the season — the date part of the
  // stored timestamp is the date iForms showed.
  const at = (d) => (d ? `${d}T09:00:00Z` : null)

  // An upgrade (waiting in the last export, signed in this one) replaces the
  // waiting record. Not an UPDATE: the app may never turn a row into "signed"
  // by editing it (RLS) — only the signing function can — so the waiting row is
  // removed (allowed for imported rows) and the signed one added.
  const rows = [...plan.inserts, ...plan.upgrades.map((u) => u.row)].map((r) => {
    const phone = normalizePhone(r.phone) || null
    return {
      template_id: null,
      template_snapshot: {},
      template_name: r.template || NO_FORM,
      contact_id: (phone && contactByPhone.get(phone)) || null,
      contact_name: r.name,
      contact_phone: phone,
      contact_email: r.email || null,
      initiator: r.initiator || null,
      status: r.status,
      source: 'iforms',
      created_at: at(r.created),
      signed_at: at(r.signed),
    }
  })
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from('form_requests').insert(rows.slice(i, i + 500))
    if (error) throw error
  }
  if (plan.upgrades.length) {
    const { error } = await supabase.from('form_requests').delete().in('id', plan.upgrades.map((u) => u.id))
    if (error) throw error
  }
  return { added: plan.inserts.length, updated: plan.upgrades.length, unchanged: plan.unchanged }
}

// ── Sent forms ──────────────────────────────────────────────────────────────

// `hint` is the status in a sentence — shown on hover and in the legend.
export const STATUS = {
  draft: { label: 'טיוטה', cls: 'bg-slate-100 text-slate-600', hint: 'נשמר ועוד לא נשלח ללקוח' },
  sent: { label: 'ממתין לחתימה', cls: 'bg-sky-100 text-sky-800', hint: 'נשלח ללקוח, הוא עוד לא פתח את הקישור' },
  opened: { label: 'נפתח · ממתין', cls: 'bg-indigo-100 text-indigo-800', hint: 'הלקוח פתח את הקישור ועוד לא חתם' },
  signing: { label: 'בחתימה…', cls: 'bg-indigo-100 text-indigo-800', hint: 'הלקוח לחץ "חתימה" — הקובץ נוצר ברגעים אלה' },
  signed: { label: 'נחתם', cls: 'bg-green-100 text-green-800', hint: 'הלקוח חתם. הקובץ החתום נעול ושמור כאן' },
  cancelled: { label: 'בוטל', cls: 'bg-rose-100 text-rose-700', hint: 'הקישור הושבת ואי אפשר לחתום בו' },
  // Records imported from iForms — the form itself lives there.
  imported_waiting: { label: 'ממתין ב-iForms', cls: 'bg-amber-100 text-amber-800', hint: 'נשלח מ-iForms ועוד לא נחתם שם' },
  imported_draft: { label: 'טיוטה ב-iForms', cls: 'bg-slate-100 text-slate-600', hint: 'טיוטה שנשמרה ב-iForms' },
}

/** How many forms wait, were signed, sit as drafts — the history's summary. */
export async function statusCounts() {
  const count = async (statuses) => {
    const { count: n, error } = await supabase
      .from('form_requests')
      .select('id', { count: 'exact', head: true })
      .in('status', statuses)
    if (error) throw error
    return n || 0
  }
  const [waiting, signed, draft] = await Promise.all([
    count(['sent', 'opened', 'signing', 'imported_waiting']),
    count(['signed']),
    count(['draft', 'imported_draft']),
  ])
  return { waiting, signed, draft }
}

function requestsQuery({ search = '', status = '', templateId = '' }, count = false) {
  let q = supabase
    .from('form_requests')
    .select(
      'id, template_id, template_name, contact_id, contact_name, contact_phone, contact_email, extra_email, initiator, status, source, token, attachments, signed_at, signed_pdf_path, signed_pdf_sha256, created_at',
      count ? { count: 'exact' } : undefined
    )
    .order('created_at', { ascending: false })
    .order('id')
  const s = search.trim()
  if (s) {
    const like = `%${s.replace(/[%,()]/g, ' ')}%`
    q = q.or(`contact_name.ilike.${like},contact_email.ilike.${like},contact_phone.ilike.${like},template_name.ilike.${like}`)
  }
  // The filters read as the office thinks of them: "waiting" is waiting,
  // whether the form went out from here or from iForms.
  if (status === 'waiting') q = q.in('status', ['sent', 'opened', 'signing', 'imported_waiting'])
  else if (status === 'draft') q = q.in('status', ['draft', 'imported_draft'])
  else if (status) q = q.eq('status', status)
  if (templateId) q = q.eq('template_id', templateId)
  return q
}

export async function listRequests({ search = '', status = '', templateId = '', page = 0, pageSize = 50 } = {}) {
  const { data, error, count } = await requestsQuery({ search, status, templateId }, true).range(
    page * pageSize,
    page * pageSize + pageSize - 1
  )
  if (error) throw error
  return { rows: data || [], count: count || 0 }
}

/** Every matching sent form — for the Excel export. */
export const allRequests = (filters = {}) => fetchAll(() => requestsQuery(filters))

export async function getRequest(id) {
  const { data, error } = await supabase.from('form_requests').select('*').eq('id', id).single()
  if (error) throw error
  return data
}

/** The template frozen into a request — later edits must not reach it. */
export const snapshotOf = (t) => ({
  name: t.name,
  fields: t.fields || [],
  // Paths and sizes only — a signed URL on the page expires within the hour.
  pages: (t.pages || []).map(({ w, h, image }) => ({ w, h, image })),
  source_path: t.source_path,
})

export async function createRequest({ template, contact, extraEmail, initiator, values, senderImages, status }) {
  const { data, error } = await supabase
    .from('form_requests')
    .insert({
      template_id: template.id,
      template_snapshot: snapshotOf(template),
      template_name: template.name,
      contact_id: contact.id || null,
      contact_name: contact.name,
      contact_phone: contact.phone || null,
      contact_email: contact.email || null,
      extra_email: extraEmail || null,
      initiator: initiator || null,
      status,
      values: values || {},
      sender_images: senderImages || {},
    })
    .select()
    .single()
  if (error) throw error
  await logEvent(data.id, 'created', initiator)
  return data
}

export async function updateRequest(id, patch) {
  const { data, error } = await supabase
    .from('form_requests')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function logEvent(requestId, kind, actor, meta = null) {
  const { error } = await supabase.from('form_events').insert({
    request_id: requestId,
    kind,
    actor: actor || null,
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 400) : null,
    meta,
  })
  if (error) throw error
}

export async function listEvents(requestId) {
  const { data, error } = await supabase
    .from('form_events')
    .select('id, kind, actor, ip, user_agent, meta, at')
    .eq('request_id', requestId)
    .order('at')
  if (error) throw error
  return data || []
}

export async function cancelRequest(id, actor) {
  await updateRequest(id, { status: 'cancelled' })
  await logEvent(id, 'cancelled', actor)
}

export async function deleteRequest(id) {
  const { error } = await supabase.from('form_requests').delete().eq('id', id)
  if (error) throw error
}

export async function fileUrl(path, secs = 3600) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, secs)
  if (error) throw error
  return data.signedUrl
}

/** The public link the client opens. */
export const signLink = (token) => `${window.location.origin}/sign/${token}`

// ── The client's side (public, no login) ────────────────────────────────────

async function signFn(body) {
  const { data, error } = await supabase.functions.invoke('form-sign', { body })
  if (!error) return data
  let detail = null
  try {
    detail = await error.context?.json?.()
  } catch {
    /* not JSON */
  }
  const e = new Error(detail?.error || error.message || 'failed')
  e.code = detail?.error || 'failed'
  e.fields = detail?.fields || null
  throw e
}

export const loadForSigning = (token) => signFn({ action: 'load', token })
export const submitSigned = (payload) => signFn({ action: 'submit', ...payload })

// ── Export ──────────────────────────────────────────────────────────────────

/**
 * Rows as a CSV that Excel opens correctly in Hebrew: a UTF-8 BOM, quoted cells.
 */
export function downloadCsv(filename, headers, rows) {
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const text = [headers.map(cell).join(','), ...rows.map((r) => r.map(cell).join(','))].join('\r\n')
  const blob = new Blob(['﻿', text], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}
