// Opening a WhatsApp chat with a client — in the desktop app when it exists,
// in the browser when it doesn't.
//
// Two different links do two different things, and the difference is the whole
// point of this file:
//
//   https://wa.me/…      an ordinary web address. Windows hands it to the
//                        default browser, so a tab opens even when WhatsApp is
//                        installed. This is what you get by default.
//   whatsapp://send?…    a protocol WhatsApp registers when it installs. The OS
//                        hands it straight to the app — no browser at all.
//
// The catch: a browser will not tell us whether a protocol handler exists. So
// we fire the app link, then watch for the page losing focus. Focus leaving
// means the app took over; focus staying put for a beat means nothing handled
// it, and we quietly fall back to the web link. It is a heuristic — but there
// is no honest alternative, because the browser deliberately keeps it secret.
//
// NOTE: this only ever OPENS a chat with the message pre-filled. Sending is
// left to the agent, and to their own phone number — which is also why it is
// unaffected by the bot's three-chat limit.

import { toWaNumber } from './waTemplates'

const FALLBACK_MS = 1200

/** Phones open the app from an ordinary link already, so they skip the dance. */
function isMobile() {
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent)
}

/**
 * Open a WhatsApp chat, preferring the installed desktop app.
 *
 * @param {string} phone  any format — 0501234567, 050-123-4567, 972501234567
 * @param {string} text   message to pre-fill (not sent)
 * @returns {boolean}     false when the number was unusable
 */
export function openWhatsApp(phone, text = '') {
  const number = toWaNumber(phone)
  if (!number) return false

  const encoded = encodeURIComponent(text || '')
  const webUrl = `https://wa.me/${number}${encoded ? `?text=${encoded}` : ''}`

  if (isMobile()) {
    window.open(webUrl, '_blank', 'noopener')
    return true
  }

  const appUrl = `whatsapp://send?phone=${number}${encoded ? `&text=${encoded}` : ''}`

  let settled = false
  const onHide = () => {
    if (document.hidden) stop()
  }
  function stop() {
    if (settled) return
    settled = true
    clearTimeout(timer)
    window.removeEventListener('blur', stop)
    document.removeEventListener('visibilitychange', onHide)
  }

  // If either fires, the OS handed the link to the app — and we must NOT also
  // open a browser tab. That double-open is the bug this guards against.
  window.addEventListener('blur', stop)
  document.addEventListener('visibilitychange', onHide)

  const timer = setTimeout(() => {
    if (settled) return
    settled = true
    window.removeEventListener('blur', stop)
    document.removeEventListener('visibilitychange', onHide)
    window.open(webUrl, '_blank', 'noopener')
  }, FALLBACK_MS)

  // Assigning to location keeps this page intact: an unhandled custom protocol
  // is ignored rather than navigated to.
  window.location.href = appUrl
  return true
}
