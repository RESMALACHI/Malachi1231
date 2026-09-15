// טפסים by email — all through the form-mail edge function (Resend). The
// Resend key is set from ניהול → מייל and never comes back to the browser.

import { supabase } from '../lib/supabaseClient'

async function mailFn(body) {
  const { data, error } = await supabase.functions.invoke('form-mail', { body })
  if (!error) return data
  let detail = null
  try {
    detail = await error.context?.json?.()
  } catch {
    /* not JSON */
  }
  const e = new Error(detail?.message || 'שליחת המייל נכשלה')
  e.code = detail?.error || 'failed'
  throw e
}

let statusPromise = null

/** { configured, keyHint, from, fromName, replyTo, officeCopy } — asked once per visit. */
export function mailStatus({ fresh = false } = {}) {
  if (fresh || !statusPromise) {
    statusPromise = mailFn({ action: 'status' }).catch((e) => {
      statusPromise = null
      throw e
    })
  }
  return statusPromise
}

export async function saveMailSettings(settings) {
  const r = await mailFn({ action: 'save', ...settings })
  statusPromise = null
  return r
}

export const sendTestMail = (to) => mailFn({ action: 'test', to })

/**
 * The link to fill and sign, to the contact's email (+ the extra one).
 *   again     a deliberate second send (not deduplicated like the first)
 *   reminder  worded as a reminder: "it's still waiting for your signature"
 */
export const emailSignLink = (requestId, { agent, again = false, reminder = false } = {}) =>
  mailFn({ action: 'send', requestId, agent, resend: again, reminder, origin: window.location.origin })

/** The signed PDF again, to the contact — the first one goes by itself on signing. */
export const emailSignedCopy = (requestId, agent) => mailFn({ action: 'copy', requestId, agent })
