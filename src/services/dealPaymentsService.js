// Charges against a deal, and the month view built from them.
//
// deals.collected is KEPT as a cached sum of these rows and written on every
// change here. Everything else in the app still reads it — the bonus maths, the
// deals report, the bot's list_deals — and none of that had to learn about
// payments to keep working.

import { supabase } from '../lib/supabaseClient'
import { getDeals } from './dealsService'

const pad = (n) => String(n).padStart(2, '0')

/** First day of the month, and of the one after — the date-typed column's bounds. */
function monthDates(year, month) {
  const from = `${year}-${pad(month + 1)}-01`
  const ny = month === 11 ? year + 1 : year
  const nm = month === 11 ? 0 : month + 1
  return { from, to: `${ny}-${pad(nm + 1)}-01` }
}

/** Every charge on these deals, grouped by deal. Full history, not one month. */
export async function paymentsFor(dealIds) {
  const ids = [...new Set(dealIds)].filter(Boolean)
  if (ids.length === 0) return {}

  const { data, error } = await supabase
    .from('deal_payments')
    .select('id, deal_id, amount, paid_on, note, created_at')
    .in('deal_id', ids)
    .order('paid_on', { ascending: true })
  if (error) throw error

  const by = {}
  for (const p of data || []) (by[p.deal_id] ||= []).push(p)
  return by
}

/**
 * Keep deals.collected equal to the sum of its charges.
 *
 * Read back and written rather than incremented, so it self-heals: whatever the
 * rows say is what the column ends up holding, even if an earlier write failed
 * halfway.
 */
async function syncCollected(dealId) {
  const { data, error } = await supabase
    .from('deal_payments')
    .select('amount')
    .eq('deal_id', dealId)
  if (error) throw error

  const total = (data || []).reduce((s, p) => s + Number(p.amount || 0), 0)
  const { error: upErr } = await supabase
    .from('deals')
    .update({ collected: total, updated_at: new Date().toISOString() })
    .eq('id', dealId)
  if (upErr) throw upErr
  return total
}

/** Record a charge. `paidOn` is the date the money moved — it decides the month. */
export async function addPayment(dealId, { amount, paidOn, note }) {
  const value = Number(amount)
  if (!Number.isFinite(value) || value === 0) throw new Error('bad_amount')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(paidOn || ''))) throw new Error('bad_date')

  const { error } = await supabase.from('deal_payments').insert({
    deal_id: dealId,
    amount: value,
    paid_on: paidOn,
    note: note?.trim() || null,
  })
  if (error) throw error
  return syncCollected(dealId)
}

export async function deletePayment(paymentId, dealId) {
  const { error } = await supabase.from('deal_payments').delete().eq('id', paymentId)
  if (error) throw error
  return syncCollected(dealId)
}

/**
 * Everything the deals page needs for one month.
 *
 * Two sets of deals, because a month owns more than the deals signed in it: one
 * signed in July and settled in September is September's credit, and September
 * has to be able to show it. So the deals SIGNED this month are loaded, plus any
 * deal — from any month — that was charged this month. Their FULL payment
 * history comes along, since whether a charge completed a deal depends on what
 * was paid before it.
 */
export async function loadMonthBilling(agentName, year, month) {
  const deals = await getDeals(agentName, year, month)
  const { from, to } = monthDates(year, month)

  const { data: paidHere, error } = await supabase
    .from('deal_payments')
    .select('deal_id')
    .gte('paid_on', from)
    .lt('paid_on', to)
  if (error) throw error

  const known = new Set(deals.map((d) => d.id))
  const extraIds = [...new Set((paidHere || []).map((p) => p.deal_id))].filter(
    (id) => !known.has(id)
  )

  let extras = []
  if (extraIds.length > 0) {
    let q = supabase
      .from('deals')
      .select(
        'id, meeting_id, agent_name, client_name, amount, collected, kind, notes, deal_date, created_at'
      )
      .in('id', extraIds)
    // A manager sees everyone; an agent only ever sees their own, here as well.
    if (agentName) q = q.eq('agent_name', agentName)
    const { data, error: exErr } = await q
    if (exErr) throw exErr
    extras = data || []
  }

  const all = [...deals, ...extras]
  return { deals: all, paymentsByDeal: await paymentsFor(all.map((d) => d.id)) }
}
