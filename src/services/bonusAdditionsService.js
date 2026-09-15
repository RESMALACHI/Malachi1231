// Additions to the deal bonus — money an agent adds to their month by hand,
// with the reason (migration 0017). Counted in lib/dealsBonus.js.

import { supabase } from '../lib/supabaseClient'

/** One month's additions: one agent's, or — for a manager, agentName null — everyone's. */
export async function listAdditions({ agentName = null, month }) {
  let q = supabase
    .from('deal_bonus_additions')
    .select('id, agent_name, month, amount, note, created_by, created_at')
    .eq('month', month)
    .order('created_at')
  if (agentName) q = q.eq('agent_name', agentName)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function addAddition({ agentName, month, amount, note, createdBy }) {
  const { data, error } = await supabase
    .from('deal_bonus_additions')
    .insert({ agent_name: agentName, month, amount, note: note.trim(), created_by: createdBy || agentName })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteAddition(id) {
  const { error } = await supabase.from('deal_bonus_additions').delete().eq('id', id)
  if (error) throw error
}
