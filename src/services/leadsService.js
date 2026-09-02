// Lead sources (the webhooks people POST to) and the leads that arrive on them.

import { supabase } from '../lib/supabaseClient'

/** The public URL an outside system posts a lead to. */
export function hookUrl(token) {
  const base = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
  return `${base}/functions/v1/lead-hook?t=${token}`
}

/**
 * A fresh token.
 *
 * crypto.getRandomValues, not Math.random: this string is the only thing
 * standing between the internet and the leads table, and Math.random is
 * predictable enough to guess given a couple of samples.
 */
export function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function listSources() {
  const { data, error } = await supabase
    .from('lead_sources')
    .select('id, name, token, active, assign_to, field_map, last_payload, last_seen_at, received, created_at')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data || []
}

export async function createSource({ name, assign_to = null, field_map = {} }) {
  const { data, error } = await supabase
    .from('lead_sources')
    .insert({ name, token: newToken(), assign_to, field_map })
    .select('id')
    .single()
  if (error) throw error
  return data
}

export async function updateSource(id, patch) {
  const { error } = await supabase.from('lead_sources').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteSource(id) {
  const { error } = await supabase.from('lead_sources').delete().eq('id', id)
  if (error) throw error
}

/** A new token for an existing source — the old URL stops working at once. */
export async function rotateToken(id) {
  const token = newToken()
  const { error } = await supabase.from('lead_sources').update({ token }).eq('id', id)
  if (error) throw error
  return token
}

/** `agentName` null = everyone's; a name = only theirs. */
export async function listLeads({ limit = 50, agentName = null } = {}) {
  let q = supabase
    .from('leads')
    .select('id, source_name, agent_name, name, phone, email, note, status, relevant, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (agentName) q = q.eq('agent_name', agentName)

  const { data, error } = await q
  if (error) throw error
  return data || []
}

/**
 * Handled, or not. The whole status model, on purpose.
 *
 * 'new' is what the webhook writes, so anything that is not 'done' counts as
 * waiting — including rows written before this was a binary.
 */
export async function setLeadHandled(id, done) {
  const { error } = await supabase
    .from('leads')
    .update({ status: done ? 'done' : 'new' })
    .eq('id', id)
  if (error) throw error
}

/** How many are still waiting — the number on the menu badge. */
export async function countOpenLeads(agentName = null) {
  let q = supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .neq('status', 'done')
  if (agentName) q = q.eq('agent_name', agentName)

  const { count, error } = await q
  if (error) throw error
  return count || 0
}

/** רלוונטי / לא רלוונטי — independent of whether it was handled. */
export async function setLeadRelevant(id, relevant) {
  const { error } = await supabase.from('leads').update({ relevant }).eq('id', id)
  if (error) throw error
}

export async function setLeadAgent(id, agent_name) {
  const { error } = await supabase.from('leads').update({ agent_name }).eq('id', id)
  if (error) throw error
}

export async function deleteLead(id) {
  const { error } = await supabase.from('leads').delete().eq('id', id)
  if (error) throw error
}

/** How many leads arrived today, and how many are still untouched. */
export async function leadStats() {
  const midnight = new Date()
  midnight.setHours(0, 0, 0, 0)

  const [today, fresh, total] = await Promise.all([
    supabase.from('leads').select('id', { count: 'exact', head: true })
      .gte('created_at', midnight.toISOString()),
    supabase.from('leads').select('id', { count: 'exact', head: true }).neq('status', 'done'),
    supabase.from('leads').select('id', { count: 'exact', head: true }),
  ])

  return { today: today.count || 0, fresh: fresh.count || 0, total: total.count || 0 }
}

/** One lead, whole row — the profile's header. */
export async function getLead(id) {
  const { data, error } = await supabase
    .from('leads')
    .select('id, source_name, agent_name, name, phone, email, note, status, relevant, created_at')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data
}

/* ── The lead's file: notes and dated tasks ─────────────────────────── */

export async function listActivities(leadId) {
  const { data, error } = await supabase
    .from('lead_activities')
    .select('id, kind, content, due_date, done, author, created_at')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function addActivity(leadId, { kind, content, due_date = null, author = null }) {
  const { data, error } = await supabase
    .from('lead_activities')
    .insert({ lead_id: leadId, kind, content, due_date, author })
    .select('id, kind, content, due_date, done, author, created_at')
    .single()
  if (error) throw error
  return data
}

export async function setActivityDone(id, done) {
  const { error } = await supabase.from('lead_activities').update({ done }).eq('id', id)
  if (error) throw error
}

export async function deleteActivity(id) {
  const { error } = await supabase.from('lead_activities').delete().eq('id', id)
  if (error) throw error
}

/**
 * Lead-tasks whose day has arrived (or passed), still open — the TodayPage
 * block. A dated task that never resurfaces on its date is a broken promise.
 */
export async function dueLeadTasks(agentName = null) {
  const today = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const key = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`

  let q = supabase
    .from('lead_activities')
    .select('id, content, due_date, lead_id, leads!inner(id, name, phone, agent_name)')
    .eq('kind', 'task')
    .eq('done', false)
    .lte('due_date', key)
    .order('due_date', { ascending: true })
    .limit(20)
  if (agentName) q = q.eq('leads.agent_name', agentName)

  const { data, error } = await q
  if (error) throw error
  return data || []
}
