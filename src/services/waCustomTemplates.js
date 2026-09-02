// Personal WhatsApp templates — each agent's own wording, stored per name and
// editable from the WhatsApp page by whoever connected their number.
//
// A stored row is plain text with Hebrew placeholders. `toRuntime` turns it
// into the same shape the built-in templates have ({key, title, fields,
// build}), so the picker, the form and the meeting modal treat both kinds
// identically and nothing downstream knows the difference.

import { supabase } from '../lib/supabaseClient'
import { branchByKey, branchLines, prettyDate } from '../lib/waTemplates'

/**
 * The placeholders an agent can type, and what each becomes.
 *
 * Hebrew words in curly braces — the people writing these think in Hebrew, and
 * {name} would be one more thing to memorize. The list is exported so the
 * editor can render them as insert-buttons instead of asking anyone to
 * remember the spelling.
 */
export const PLACEHOLDERS = [
  { token: '{שם}', label: 'שם הלקוח', field: 'name' },
  { token: '{תאריך}', label: 'תאריך', field: 'date' },
  { token: '{שעה}', label: 'שעה', field: 'time' },
  { token: '{סניף}', label: 'שם הסניף', field: 'branch' },
  { token: '{כתובת}', label: 'כתובת + ניווט', field: 'branch' },
  { token: '{סוכן}', label: 'השם שלך', field: null }, // filled from who is signed in
]

export async function listMyTemplates(agentName) {
  const { data, error } = await supabase
    .from('wa_templates')
    .select('id, title, body, updated_at')
    .eq('agent_name', agentName)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data || []
}

export async function createTemplate(agentName, { title, body }) {
  const { data, error } = await supabase
    .from('wa_templates')
    .insert({ agent_name: agentName, title, body })
    .select('id, title, body, updated_at')
    .single()
  if (error) throw error
  return data
}

export async function updateTemplate(id, { title, body }) {
  const { error } = await supabase
    .from('wa_templates')
    .update({ title, body, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function deleteTemplate(id) {
  const { error } = await supabase.from('wa_templates').delete().eq('id', id)
  if (error) throw error
}

/** Which input fields a body actually needs — derived from its placeholders,
 *  so the form shows exactly the boxes this text can use and nothing else. */
export function fieldsOf(body) {
  const text = String(body || '')
  const fields = []
  for (const p of PLACEHOLDERS) {
    if (p.field && text.includes(p.token) && !fields.includes(p.field)) fields.push(p.field)
  }
  return fields
}

/** A stored row → a template object identical in shape to the built-ins. */
export function toRuntime(row) {
  return {
    key: `mine-${row.id}`,
    id: row.id,
    mine: true,
    title: row.title,
    hint: 'תבנית אישית',
    fields: fieldsOf(row.body),
    build: (v = {}) => renderBody(row.body, v),
  }
}

/**
 * Fill a body's placeholders from the form values.
 *
 * A placeholder with no value simply disappears rather than survive as
 * "{שם}" in a real client's chat — a half-filled token reaching a customer
 * is worse than a missing word.
 */
export function renderBody(body, v = {}) {
  const branch = v.branch ? branchByKey(v.branch) : null
  return String(body || '')
    .replaceAll('{שם}', String(v.name || '').trim())
    .replaceAll('{תאריך}', v.date ? prettyDate(v.date) : '')
    .replaceAll('{שעה}', String(v.time || '').trim())
    .replaceAll('{סניף}', branch ? branch.label : '')
    .replaceAll('{כתובת}', branch ? branchLines(branch).trim() : '')
    .replaceAll('{סוכן}', String(v.agent || '').trim())
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
