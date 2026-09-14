// זירת אימון — the practice calls, and their history.

import { supabase } from '../lib/supabaseClient'

/** The fields of a persona the prospect is played from (see training-sim). */
const personaPayload = (p) => ({
  name: p.name,
  gender: p.gender,
  startTrust: p.startTrust,
  bookAt: p.bookAt,
  opening: p.opening,
  brief: p.brief,
})

const historyPayload = (transcript) =>
  transcript.map(({ role, text, trust, gain, measured, trustNow }) => ({
    role,
    text,
    trust,
    gain,
    measured,
    trustNow,
  }))

/**
 * supabase.functions.invoke hides a non-2xx body behind a generic error. The
 * body is the useful part here ("rate_limited" and how long to wait), so it is
 * dug back out.
 */
async function invoke(body) {
  const { data, error } = await supabase.functions.invoke('training-sim', { body })
  if (!error) return data
  let detail = null
  try {
    detail = await error.context?.json?.()
  } catch {
    /* not JSON */
  }
  const err = new Error(detail?.error || error.message || 'failed')
  err.code = detail?.error || 'failed'
  err.retryAfter = detail?.retryAfter ?? null
  throw err
}

/** The prospect's next line. */
export function simTurn({ persona, rep, transcript }) {
  return invoke({
    action: 'turn',
    lang: persona.lang,
    persona: personaPayload(persona),
    rep,
    history: historyPayload(transcript),
  })
}

/** The coach's read of a finished call. */
export function simGrade({ persona, rep, transcript, outcome, metrics, objections }) {
  return invoke({
    action: 'grade',
    lang: persona.lang,
    persona: personaPayload(persona),
    rep,
    history: historyPayload(transcript),
    outcome,
    metrics,
    objections,
  })
}

export async function saveSession(row) {
  const { data, error } = await supabase.from('sim_sessions').insert(row).select().single()
  if (error) throw error
  return data
}

/** Grading lands after the row is saved — a call is kept even if its grade fails. */
export async function updateSession(id, patch) {
  const { error } = await supabase.from('sim_sessions').update(patch).eq('id', id)
  if (error) throw error
}

/** An agent's recent calls — or, with no name, everyone's (the manager's view). */
export async function listSessions(agentName, { days = 30, limit = 60 } = {}) {
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  let q = supabase
    .from('sim_sessions')
    .select('id, agent_name, persona, lang, outcome, score, transcript, feedback, duration_s, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (agentName) q = q.eq('agent_name', agentName)
  const { data, error } = await q
  if (error) throw error
  return data || []
}
