import { supabase } from '../lib/supabaseClient'

/**
 * Push notifications, from the browser's side.
 *
 * Everything here is defensive: push is unavailable on plenty of real devices
 * (old iOS, a browser tab that was never installed, a locked-down work laptop),
 * and none of that is an error worth showing. `getPushState` reports what is
 * possible so the UI can say something true instead of offering a button that
 * cannot work.
 */

/** The VAPID public key must reach the browser as raw bytes, not base64url. */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

/** ArrayBuffer → base64url, the shape the server stores. */
function bufToBase64Url(buf) {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return window.btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function pushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/**
 * True when the page is running as an installed app.
 *
 * This matters on iPhone and nowhere else: Safari refuses push entirely until
 * the site has been added to the home screen, so the UI has to ask for the
 * install before it can ask for permission.
 */
export function isInstalled() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  )
}

export function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

/** What the UI needs to decide what to show. */
export async function getPushState() {
  if (!pushSupported()) {
    return {
      supported: false,
      needsInstall: isIOS() && !isInstalled(),
      permission: 'unsupported',
      subscribed: false,
    }
  }
  let subscribed = false
  try {
    const reg = await navigator.serviceWorker.ready
    subscribed = Boolean(await reg.pushManager.getSubscription())
  } catch {
    subscribed = false
  }
  return {
    supported: true,
    needsInstall: isIOS() && !isInstalled(),
    permission: Notification.permission, // 'default' | 'granted' | 'denied'
    subscribed,
  }
}

async function callPush(body) {
  const { data, error } = await supabase.functions.invoke('push', { body })
  if (error) {
    let payload = null
    try {
      payload = await error.context?.json?.()
    } catch {
      payload = null
    }
    throw new Error(payload?.error || error.message || 'push_failed')
  }
  if (!data?.ok) throw new Error(data?.error || 'push_failed')
  return data
}

/**
 * Ask for permission and register this device.
 *
 * Throws with a code the UI can turn into a sentence — 'denied' in particular,
 * because a browser only ever asks once and the user has to undo it in site
 * settings afterwards.
 */
export async function enablePush(agentName) {
  if (!pushSupported()) throw new Error('unsupported')

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error(permission === 'denied' ? 'denied' : 'dismissed')

  const { publicKey } = await callPush({ action: 'key' })
  const reg = await navigator.serviceWorker.ready

  // Reuse the browser's existing subscription when there is one; calling
  // subscribe() twice with the same key returns it anyway, but asking first
  // keeps the happy path off the network.
  const sub =
    (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }))

  await callPush({
    action: 'subscribe',
    agentName,
    userAgent: navigator.userAgent,
    subscription: {
      endpoint: sub.endpoint,
      keys: {
        p256dh: bufToBase64Url(sub.getKey('p256dh')),
        auth: bufToBase64Url(sub.getKey('auth')),
      },
    },
  })

  return true
}

/** Unregister this device. The browser subscription is dropped too. */
export async function disablePush() {
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  await callPush({ action: 'unsubscribe', endpoint: sub.endpoint }).catch(() => {})
  await sub.unsubscribe()
}

/** Send a notification to this agent's own devices, to prove it works. */
export async function sendTestPush(agentName, { title, body }) {
  return callPush({ action: 'test', agentName, title, body, url: '/', tag: 'test' })
}
