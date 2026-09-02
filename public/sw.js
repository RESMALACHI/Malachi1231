// Service worker — offline shell for the installed app.
//
// The caching strategy here is shaped by a bug this app already lived through:
// a stale HTML document that referenced JavaScript chunks which no longer
// existed produced a blank white screen that only a hard refresh fixed. A
// naive "cache everything, serve from cache" worker reintroduces exactly that,
// permanently. So:
//
//   • Navigations (the HTML document) are NETWORK-FIRST. A fresh deploy is
//     always picked up while online; the cached copy is a fallback for offline
//     only, never the default answer.
//   • /assets/* are CACHE-FIRST, which is safe precisely because Vite puts a
//     content hash in every filename — a given URL's bytes never change.
//   • Everything else (Supabase calls, fonts, video) is left alone entirely.
//     Caching API responses would show agents yesterday's meetings and call it
//     today's, which is worse than showing nothing.
//
// Bump CACHE_VERSION to evict everything from previous deploys.
const CACHE_VERSION = 'res-v2'
const SHELL = `${CACHE_VERSION}-shell`
const ASSETS = `${CACHE_VERSION}-assets`

self.addEventListener('install', (event) => {
  // Take over as soon as the new worker is ready rather than waiting for every
  // tab to close — an agent with the app pinned open would otherwise sit on an
  // old worker for days.
  self.skipWaiting()
  event.waitUntil(caches.open(SHELL).then((c) => c.add('/')))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k))
      )
      await self.clients.claim()
    })()
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // ── The document: network first, cache as a safety net ──
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req)
          const cache = await caches.open(SHELL)
          cache.put('/', fresh.clone())
          return fresh
        } catch {
          const cached = await caches.match('/', { cacheName: SHELL })
          return cached || Response.error()
        }
      })()
    )
    return
  }

  // ── Hashed build output: cache first, it can never go stale ──
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      (async () => {
        const hit = await caches.match(req, { cacheName: ASSETS })
        if (hit) return hit
        const res = await fetch(req)
        // Only store a real success. An opaque or error response cached here
        // would keep serving a broken chunk until the next version bump.
        if (res.ok) {
          const cache = await caches.open(ASSETS)
          cache.put(req, res.clone())
        }
        return res
      })()
    )
  }
})

// ── Push notifications ────────────────────────────────────────────────────
// The payload is written by the push edge function; the shape is
// { title, body, url, tag, markToken?, markUrl? }. A push with no usable
// payload is still shown — a silent failure would be indistinguishable from
// "no notification was sent".
//
// When markToken is present the notification carries "הגיע" / "לא הגיע"
// buttons, and tapping one records the answer without opening the app at all.
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }

  const actions = data.markToken
    ? [
        { action: 'attended', title: 'הגיע' },
        { action: 'no_show', title: 'לא הגיע' },
      ]
    : []

  event.waitUntil(
    self.registration.showNotification(data.title || 'מכללת R.E.S', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      dir: 'rtl',
      lang: 'he',
      // Same tag replaces an earlier notification instead of stacking — an
      // agent who ignored three "not marked yet" reminders should find one.
      tag: data.tag || 'res',
      renotify: Boolean(data.tag),
      actions,
      data: {
        url: data.url || '/',
        markToken: data.markToken || null,
        markUrl: data.markUrl || null,
      },
    })
  )
})

/** Open the app, reusing an already-open window when there is one. */
async function openApp(target) {
  const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  for (const client of all) {
    if (client.url.includes(self.location.origin)) {
      await client.focus()
      if ('navigate' in client) await client.navigate(target)
      return
    }
  }
  await self.clients.openWindow(target)
}

self.addEventListener('notificationclick', (event) => {
  const { url, markToken, markUrl } = event.notification.data || {}
  const choice = event.action

  event.notification.close()

  // Body tap (no action) — just open the app.
  if (choice !== 'attended' && choice !== 'no_show') {
    event.waitUntil(openApp(url || '/'))
    return
  }

  event.waitUntil(
    (async () => {
      // Without a token there is nothing to send; fall back to opening the app
      // rather than silently dropping the tap.
      if (!markToken || !markUrl) {
        await openApp(url || '/')
        return
      }

      try {
        const res = await fetch(markUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: markToken, status: choice }),
        })
        const out = await res.json().catch(() => ({}))

        if (out?.ok) {
          // A confirmation the agent can ignore — but its absence would leave
          // them wondering whether the tap registered at all.
          await self.registration.showNotification(
            choice === 'attended' ? 'סומן: הגיע ✓' : 'סומן: לא הגיע',
            {
              body: out.title || '',
              icon: '/icon-192.png',
              badge: '/icon-192.png',
              dir: 'rtl',
              lang: 'he',
              tag: 'mark-result',
            }
          )
          return
        }

        // Already used, expired, or the server refused: say so and open the app
        // so the agent can finish the job by hand.
        await self.registration.showNotification('הסימון לא נשמר', {
          body: 'פתחו את המערכת וסמנו ידנית.',
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          dir: 'rtl',
          lang: 'he',
          tag: 'mark-result',
        })
      } catch {
        // Offline: the tap is lost, so it has to be visible. Anything quieter
        // reads as success.
        await self.registration.showNotification('אין חיבור', {
          body: 'הסימון לא נשלח. נסו שוב מהמערכת.',
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          dir: 'rtl',
          lang: 'he',
          tag: 'mark-result',
        })
      }
    })()
  )
})
