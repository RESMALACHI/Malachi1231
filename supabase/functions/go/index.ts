// Supabase Edge Function: go
//
// Tiny redirect for the bot's client-confirmation links. The wa.me URL with the
// full encoded template is thousands of characters — pasting it into the group
// chat would drown the message. So wa-webhook stores it in wa_links and posts
// .../go?id=abc123 instead; this function redirects the click to WhatsApp.
//
// Device-aware target:
//   Mobile  → wa.me (deep-links straight into the WhatsApp app).
//   Desktop → web.whatsapp.com/send (opens the chat directly in WhatsApp Web).
// The desktop path deliberately AVOIDS wa.me: on desktop it hands off through
// the whatsapp:// protocol to the native app, which adds an interstitial page
// and mangles emoji into "?" on Windows. web.whatsapp.com keeps both intact.
//
// This redirect stays entirely between the bot and WhatsApp — it deliberately
// never routes through the R.E.S app. An earlier version sent desktop clicks to
// a hand-off page hosted there to open WhatsApp Desktop; that was removed on
// request, and the app must not be reintroduced into this path.
//
// Safety: redirects ONLY to wa.me/web.whatsapp.com URLs derived from what the
// bot itself stored — it can never be used as an open redirect.
import { createClient } from 'jsr:@supabase/supabase-js@2'

Deno.serve(async (req) => {
  const id = new URL(req.url).searchParams.get('id') || ''
  if (!/^[a-z0-9]{6,32}$/i.test(id)) return new Response('not found', { status: 404 })

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  const { data } = await admin.from('wa_links').select('url').eq('id', id).maybeSingle()

  const m = (data?.url || '').match(/^https:\/\/wa\.me\/(\d+)\?text=(.*)$/)
  if (!m) return new Response('not found', { status: 404 })

  const ua = req.headers.get('user-agent') || ''
  const isMobile = /Android|iPhone|iPad|iPod|Windows Phone/i.test(ua)
  const target = isMobile
    ? data!.url
    : `https://web.whatsapp.com/send?phone=${m[1]}&text=${m[2]}`

  return new Response(null, { status: 302, headers: { Location: target } })
})
