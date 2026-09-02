import { supabase } from '../lib/supabaseClient'
import { clientName } from '../lib/meetingTitle'
import { formatFullDay, formatTime } from '../lib/dateUtils'

function fillLocally(template, meeting, agentName) {
  const values = {
    '{שם_לקוח}': clientName(meeting?.title, meeting?.agent_name),
    '{תאריך}': formatFullDay(meeting?.meeting_date),
    '{שעה}': formatTime(meeting?.meeting_date),
    '{מיקום}': String(meeting?.location || '').trim() || 'במקום שנקבע',
    '{שם_סוכן}': String(agentName || '').trim(),
  }

  let message = String(template || '')
  for (const [token, value] of Object.entries(values)) {
    message = message.split(token).join(value)
  }
  return message.replace(/\s+([,.!?])/g, '$1').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * Ask the existing R.E.S assistant for one WhatsApp draft.
 *
 * This intentionally does not write to assistant_messages: a quick client
 * message is a tool action, not a turn in the agent's private AI conversation.
 * Meeting fields and client details are not sent automatically. The model sees
 * only what the agent typed, then returns a template with placeholders; names,
 * date, time and location are filled on this device only.
 */
export async function generateMeetingWhatsApp({ meeting, agentName, intent, style }) {
  const { data, error } = await supabase.functions.invoke('ai-chat', {
    body: {
      mode: 'whatsapp_draft',
      intent,
      style,
    },
  })

  if (error || !data?.reply) {
    throw new Error(data?.error || error?.message || 'no_reply')
  }

  return fillLocally(data.reply, meeting, agentName)
}
