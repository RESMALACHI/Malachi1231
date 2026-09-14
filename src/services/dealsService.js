import { supabase } from '../lib/supabaseClient'

const pad = (n) => String(n).padStart(2, '0')

/**
 * Start/end dates (YYYY-MM-DD) of a month, for the date-typed deal_date column.
 *
 * Built from the calendar fields directly, NOT from monthRange(): that returns
 * a UTC ISO string, so local midnight on 01/07 serialises to 30/06T21:00Z and
 * slicing it to a date would shift every month boundary back by a day.
 */
function monthDates(year, month) {
  const from = `${year}-${pad(month + 1)}-01`
  const nextYear = month === 11 ? year + 1 : year
  const nextMonth = month === 11 ? 0 : month + 1
  const to = `${nextYear}-${pad(nextMonth + 1)}-01`
  return { from, to }
}

/** Today as YYYY-MM-DD in local time — the default date for a new deal. */
export function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * Deals for a month. `agentName` null → every agent's (the manager view).
 * Newest first.
 */
export async function getDeals(agentName, year, month) {
  const { from, to } = monthDates(year, month)
  let q = supabase
    .from('deals')
    .select(
      'id, meeting_id, agent_name, client_name, amount, collected, kind, notes, deal_date, offer_date, created_at'
    )
    .gte('deal_date', from)
    .lt('deal_date', to)
    .order('deal_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (agentName) q = q.eq('agent_name', agentName)

  const { data, error } = await q
  if (error) throw error
  return data || []
}

/**
 * Create or update a deal. Returns the saved row.
 *
 * COLLECTION IS NOT A FIELD OF THE DEAL ANY MORE — it is the dated charges in
 * deal_payments, and deals.collected is only their cached sum. This used to write
 * the form's "collected" straight onto the deal and create no charge, so a course
 * saved as fully paid showed on the page as unpaid: the page reads the charges,
 * and there were none. (Reported on ספיר שמואלי's course, 14/09.)
 *
 *   New deal  — an amount collected at signing becomes the deal's first charge,
 *               dated to the deal.
 *   Edit      — collected is not written at all. It is changed by adding or
 *               removing a charge, and writing a form value over it here would
 *               overwrite the real sum with a stale one.
 */
export async function saveDeal({
  id,
  meetingId,
  agentName,
  clientName,
  amount,
  collected,
  kind,
  notes,
  dealDate,
  offerDate,
}) {
  const row = {
    meeting_id: meetingId || null,
    agent_name: agentName,
    client_name: clientName || null,
    amount: Number(amount) || 0,
    kind: kind === 'course' ? 'course' : 'project',
    notes: notes?.trim() || null,
    deal_date: dealDate,
    // Documentation only — see the column's own comment.
    offer_date: offerDate || null,
    updated_at: new Date().toISOString(),
  }

  if (id) {
    const { data, error } = await supabase.from('deals').update(row).eq('id', id).select().single()
    if (error) throw error
    return data
  }

  // Empty stays NULL, never 0: "not recorded yet" and "collected nothing" are
  // different answers and the bonus treats them differently.
  const atSigning =
    collected === '' || collected === null || collected === undefined ? null : Number(collected)

  const { data, error } = await supabase
    .from('deals')
    .insert({ ...row, collected: atSigning })
    .select()
    .single()
  if (error) throw error

  if (atSigning && atSigning > 0) {
    const { error: payErr } = await supabase.from('deal_payments').insert({
      deal_id: data.id,
      amount: atSigning,
      paid_on: dealDate,
      note: 'נגבה בעת רישום העסקה',
    })
    // The deal exists either way; a failed charge must say so rather than leave
    // a deal whose cached total claims money its history does not show.
    if (payErr) {
      await supabase.from('deals').update({ collected: null }).eq('id', data.id)
      throw new Error('העסקה נשמרה, אבל רישום הגבייה נכשל — הוסיפו אותה ב"עדכון חיוב"')
    }
  }
  return data
}

export async function deleteDeal(id) {
  const { error } = await supabase.from('deals').delete().eq('id', id)
  if (error) throw error
}

/**
 * The month's deals as a WhatsApp message for accounting.
 *
 * Returns the exact text and Efrat's number without sending anything. The text
 * is composed on the server from the database; the agent's own WhatsApp opens
 * it as a draft and the agent decides whether to press Send.
 */
export async function dealsReport({ agentName, year, month }) {
  const { data, error } = await supabase.functions.invoke('send-deals-report', {
    body: { agentName, year, month, preview: true },
  })

  let payload = data
  if (error) {
    try {
      payload = await error.context?.json?.()
    } catch {
      payload = null
    }
  }

  if (error || !payload?.ok) {
    if (payload?.error === 'no_deals') {
      throw new Error('אין עסקאות רשומות בחודש הזה — אין מה לשלוח.')
    }
    const reason = payload?.detail || payload?.error || error?.message || ''
    throw new Error(
      reason
        ? `הפקת ההודעה נכשלה: ${String(reason).slice(0, 150)}`
        : 'הפקת ההודעה נכשלה. נסו שוב.'
    )
  }
  return payload
}
