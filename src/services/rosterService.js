// Reading and writing the agent roster.
//
// It lives in `app_settings` under the key 'roster', beside the hidden-pages
// and speech settings — one shared row for the whole team, so a change made in
// the control panel reaches every device.

import { supabase } from '../lib/supabaseClient'

const CACHE_KEY = 'mt_roster'

/** The roster the last successful load returned, or null. */
export function readRosterCache() {
  try {
    const v = JSON.parse(localStorage.getItem(CACHE_KEY))
    return Array.isArray(v) && v.length ? v : null
  } catch {
    return null
  }
}

export function writeRosterCache(list) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(list))
  } catch {
    /* a full or blocked storage is not worth failing a load over */
  }
}

/** The roster from the database, or null when it has never been saved. */
export async function getRoster() {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'roster')
    .maybeSingle()

  if (error) throw error
  const list = data?.value?.agents
  return Array.isArray(list) && list.length ? list : null
}

/** Persist the roster (shared — this is the team, for everyone). */
export async function saveRoster(list) {
  const { error } = await supabase
    .from('app_settings')
    .upsert(
      { key: 'roster', value: { agents: list }, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    )

  if (error) throw error
  writeRosterCache(list)
}

/**
 * Move an agent's whole history onto a new name.
 *
 * Renaming the roster entry alone would strand every past meeting, deal and day
 * summary under a person who no longer exists. The database does all eight
 * tables in one transaction; this is only the call.
 */
export async function renameAgent(oldName, newName) {
  const { data, error } = await supabase.rpc('rename_agent', {
    old_name: oldName,
    new_name: newName,
  })
  if (error) throw error
  return data
}

/** How many rows carry this agent's name, so a deletion can be shown honestly. */
export async function agentFootprint(name) {
  const { data, error } = await supabase.rpc('agent_footprint', { name })
  if (error) throw error
  return data || {}
}
