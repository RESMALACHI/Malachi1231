import { supabase } from '../lib/supabaseClient'

// All calls go through the `whatsapp-agent` Edge Function, which holds each
// agent's Green API credentials server-side. The browser only sends the action.
async function call(payload) {
  const { data, error } = await supabase.functions.invoke('whatsapp-agent', {
    body: payload,
  })
  if (error) {
    // Surface the function's JSON error body when present.
    let detail = error.message
    try {
      const ctx = await error.context?.json?.()
      if (ctx?.error) detail = ctx.detail ? `${ctx.error} · ${ctx.detail}` : ctx.error
    } catch {
      /* ignore */
    }
    throw new Error(detail)
  }
  return data
}

/** Store this agent's Green API instance credentials (one time). */
export const saveInstance = (agentName, idInstance, apiToken, apiUrl) =>
  call({ action: 'save', agentName, idInstance, apiToken, apiUrl })

/** Current connection state — { configured, state } (state: authorized | notAuthorized). */
export const getState = (agentName) => call({ action: 'state', agentName })

/** Fetch a fresh QR — { configured, state, qr? }. qr is a base64 PNG (no data prefix). */
export const getQr = (agentName) => call({ action: 'qr', agentName })

/** Send a message to a client through this agent's WhatsApp. */
export const sendMessage = (agentName, phone, message) =>
  call({ action: 'send', agentName, phone, message })

/** Disconnect this agent's WhatsApp. */
export const logout = (agentName) => call({ action: 'logout', agentName })

/** Forget this agent's stored credentials (to re-enter them). */
export const resetInstance = (agentName) => call({ action: 'reset', agentName })

/* ── Shared company instance — used ONLY by the day-summary page ──────────
   Its credentials live server-side (RLS hides them from the browser), so the
   client just flags `shared` and the Edge Function picks the right instance. */

/** Connection state of the shared summary WhatsApp. */
export const getSummaryState = () => call({ action: 'state', shared: true })

/** QR for linking the shared summary WhatsApp (admin does this once). */
export const getSummaryQr = () => call({ action: 'qr', shared: true })

/** Send the daily summary through the shared company WhatsApp. */
export const sendSummary = (phone, message) =>
  call({ action: 'send', shared: true, phone, message })

/** Basic client-side sanity check on Green API credentials shape. */
export const credsLookValid = (idInstance, apiToken) =>
  /^\d{6,}$/.test(String(idInstance).trim()) &&
  /^[A-Za-z0-9]{15,}$/.test(String(apiToken).trim())
