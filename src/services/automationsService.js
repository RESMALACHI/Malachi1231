// The automation rules the admin composes, and the engine that runs them.

import { supabase } from '../lib/supabaseClient'

export const TRIGGERS = [
  {
    type: 'lead_untouched',
    label: 'ליד לא טופל',
    paramKey: 'minutes',
    paramLabel: 'אחרי כמה דקות',
    paramDefault: 60,
    hint: 'ליד שנשאר "ממתין" יותר מהזמן שנקבע',
  },
  {
    type: 'meeting_upcoming',
    label: 'פגישה מתקרבת',
    paramKey: 'hours',
    paramLabel: 'כמה שעות לפני',
    paramDefault: 3,
    hint: 'פגישה שתתחיל בתוך החלון שנקבע',
  },
  {
    type: 'meeting_unmarked',
    label: 'פגישה עברה ולא סומנה',
    paramKey: 'hours',
    paramLabel: 'כמה שעות אחרי',
    paramDefault: 2,
    hint: 'עבר זמן הפגישה ואף אחד לא סימן הגיע/לא הגיע',
  },
  {
    type: 'meeting_no_show',
    label: 'סומן "לא הגיע"',
    paramKey: null,
    hint: 'ברגע שפגישה מסומנת כאי-הגעה',
  },
]

export const ACTIONS = [
  { type: 'push_agent', label: 'התראה לסוכן שלו', hint: 'push למכשירים של הסוכן הרלוונטי' },
  { type: 'push_admin', label: 'התראה למנהל המערכת', hint: 'push למלאכי' },
  {
    type: 'wa_client',
    label: 'ווצאפ ללקוח',
    hint: 'נשלח מהמספר של הסוכן — עובד רק למי שחיבר ווצאפ',
    hasMessage: true,
  },
  {
    type: 'reassign_lead',
    label: 'העבר את הליד לסוכן אחר',
    hint: 'סבב — למי שהכי מזמן לא קיבל',
    leadsOnly: true,
  },
]

export async function listRules() {
  const { data, error } = await supabase
    .from('automation_rules')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data || []
}

export async function createRule(rule) {
  const { data, error } = await supabase
    .from('automation_rules')
    .insert(rule)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function updateRule(id, patch) {
  const { error } = await supabase.from('automation_rules').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteRule(id) {
  const { error } = await supabase.from('automation_rules').delete().eq('id', id)
  if (error) throw error
}

export async function listLog(limit = 15) {
  const { data, error } = await supabase
    .from('automation_log')
    .select('id, rule_id, fired_at, subject, detail, ok')
    .order('fired_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}

/** Ask the engine what WOULD fire right now, without firing anything. */
export async function peekEngine() {
  const { data, error } = await supabase.functions.invoke('automation-engine', {
    body: { peek: true },
  })
  if (error) throw new Error(error.message || 'engine_failed')
  return data
}
