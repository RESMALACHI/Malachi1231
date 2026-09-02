// One AI conversation per agent, stored server-side under their name — so
// picking a different profile on the same device shows that person's own
// thread, not whoever asked last.

import { supabase } from '../lib/supabaseClient'

const HISTORY_LIMIT = 100

export async function getThread(agentName) {
  const { data, error } = await supabase
    .from('assistant_messages')
    .select('id, role, content, created_at')
    .eq('agent_name', agentName)
    .order('created_at', { ascending: true })
    .limit(HISTORY_LIMIT)
  if (error) throw error
  return data || []
}

export async function addMessage(agentName, role, content) {
  const { data, error } = await supabase
    .from('assistant_messages')
    .insert({ agent_name: agentName, role, content })
    .select('id, role, content, created_at')
    .single()
  if (error) throw error
  return data
}

/** "שיחה חדשה" — wipes this agent's own history, nobody else's. */
export async function clearThread(agentName) {
  const { error } = await supabase.from('assistant_messages').delete().eq('agent_name', agentName)
  if (error) throw error
}
