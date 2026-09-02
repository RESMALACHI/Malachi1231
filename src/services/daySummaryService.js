import { supabase } from '../lib/supabaseClient'

/** Local (Israel) date as YYYY-MM-DD — the key a summary is filed under. */
export function localDateKey(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * Record what an agent reported today. Re-sending the summary overwrites the
 * same day rather than piling up duplicates.
 */
export async function saveDaySummary(row) {
  const { error } = await supabase
    .from('day_summaries')
    .upsert({ ...row, sent_at: new Date().toISOString() }, { onConflict: 'agent_name,summary_date' })
  if (error) throw error
}

/**
 * What is already filed for this agent today, or null.
 *
 * Read on opening the page so figures written by something other than this form
 * survive it. The extension's call counter writes straight into today's row
 * from BMBY's control centre; without this the form would open blank over the
 * top of it and send zeroes back, wiping a count nobody typed and nobody would
 * think to check.
 */
export async function getMyDaySummary(agentName, dateKey) {
  const { data, error } = await supabase
    .from('day_summaries')
    .select('*')
    .eq('agent_name', agentName)
    .eq('summary_date', dateKey)
    .maybeSingle()

  if (error) throw error
  return data || null
}

/** Every agent's reported summary for one date. */
export async function getDaySummaries(dateKey) {
  const { data, error } = await supabase
    .from('day_summaries')
    .select('*')
    .eq('summary_date', dateKey)

  if (error) throw error
  return data || []
}
