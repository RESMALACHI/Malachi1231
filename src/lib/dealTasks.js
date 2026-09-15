// A follow-up task is over once the client has closed a deal.
//
// "The client" is the meeting the deal was recorded against — and, through the
// phone number, every other meeting with the same person: the first meeting's
// follow-up is just as moot when the deal closed at the second one. Phone only,
// never the name: a name is spelled three ways and shared by strangers, and a
// task hidden by mistake is a client nobody calls back.

import { clientPhone } from './meetingTitle.js'

/**
 * The ids of `tasks` that a deal has closed.
 *
 * @param {Array} tasks        meetings on the tasks page ({ id, title, description })
 * @param {Array} dealMeetings meetings a deal was recorded against (same shape)
 */
export function closedByDeal(tasks, dealMeetings) {
  const ids = new Set(dealMeetings.map((m) => m.id))
  const phones = new Set(dealMeetings.map(clientPhone).filter(Boolean))
  const out = new Set()
  for (const m of tasks) {
    const phone = clientPhone(m)
    if (ids.has(m.id) || (phone && phones.has(phone))) out.add(m.id)
  }
  return out
}
