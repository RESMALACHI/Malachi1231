// A notification this device shows itself.
//
// Not Web Push — nothing here goes near a server. The trigger for these lives
// in the browser (see useAutoDaySummary: "you are outside the office"), so the
// message is raised locally the moment the app works that out.
//
// Why a notification at all, when the page is already open: it survives. An
// agent who glanced at the app on the way to the car keeps the reminder in the
// tray until they act on it, and tapping it opens the right page. A screen we
// navigated them to is gone the second they switch apps.

/** Notifications are possible AND already allowed — never prompts. */
export function canNotify() {
  return typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted'
}

/** 'granted' | 'denied' | 'default' | 'unsupported' */
export function notifyPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return Notification.permission
}

/**
 * Ask for permission. MUST be called from a click — a request that appears out
 * of nowhere gets denied, and a browser only ever asks once.
 */
export async function askNotifyPermission() {
  if (notifyPermission() === 'unsupported') return 'unsupported'
  try {
    return await Notification.requestPermission()
  } catch {
    return 'denied'
  }
}

/**
 * Show one notification. Resolves true only if it was actually raised, so the
 * caller can fall back to something visible in the page itself.
 *
 * Goes through the service worker registration when there is one: on Android a
 * plain `new Notification()` throws outright, and the worker's existing
 * notificationclick handler is what knows how to reuse an open window.
 */
export async function notifyLocal({ title, body, url = '/', tag = 'res-local' }) {
  if (!canNotify()) return false
  const options = {
    body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    dir: 'rtl',
    lang: 'he',
    tag,
    renotify: true,
    data: { url, markToken: null, markUrl: null },
  }
  try {
    const reg = await navigator.serviceWorker?.ready
    if (reg) {
      await reg.showNotification(title, options)
      return true
    }
  } catch {
    /* fall through to the page-level API */
  }
  try {
    new Notification(title, options)
    return true
  } catch {
    return false
  }
}
