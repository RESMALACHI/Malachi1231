// Turning WhatsApp @mentions back into names.
//
// WhatsApp puts a mention in the message text as a bare phone number and shows
// the contact's name only inside its own UI. Everything downstream — the
// calendar event, the app, the daily agenda — therefore sees "@972537361080"
// where a person wrote "@איציק".
//
// Names are resolved through Green API's getContactInfo and cached in
// wa_contacts, so each number is only ever asked about once. A row edited by
// hand (source = 'manual') is treated as the truth and never overwritten.

/** A mention is an @ followed by an international number: @972537361080 */
const MENTION = /@(\d{9,15})\b/g

export interface Instance {
  id_instance: string
  api_token: string
  api_url: string
}

/** Ask Green API who a number belongs to. Null on any failure — never throws. */
async function lookupName(inst: Instance, phone: string): Promise<string | null> {
  try {
    const base = `${String(inst.api_url).replace(/\/$/, '')}/waInstance${inst.id_instance}`
    const res = await fetch(`${base}/getContactInfo/${inst.api_token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId: `${phone}@c.us` }),
    })
    if (!res.ok) return null
    const info = await res.json()
    // contactName is how THIS phone has them saved — the name the writer saw
    // when they typed the mention. The public profile name is the fallback.
    const name = String(info?.contactName || info?.name || '').trim()
    return name || null
  } catch {
    return null
  }
}

/**
 * Replace every @number in `text` with @name.
 *
 * Any number that can't be resolved is left exactly as it was: a mention that
 * silently vanished would be worse than one showing digits.
 */
export async function resolveMentions(
  admin: any,
  text: string,
  inst: Instance | null
): Promise<string> {
  const phones = [...new Set([...text.matchAll(MENTION)].map((m) => m[1]))]
  if (phones.length === 0) return text

  const names = new Map<string, string>()

  const { data: cached } = await admin
    .from('wa_contacts')
    .select('phone, display_name')
    .in('phone', phones)
  for (const row of cached || []) names.set(row.phone, row.display_name)

  // Only numbers we've never seen cost a lookup.
  const unknown = phones.filter((p) => !names.has(p))
  if (unknown.length > 0 && inst) {
    const fresh: { phone: string; display_name: string; source: string }[] = []
    for (const phone of unknown) {
      const name = await lookupName(inst, phone)
      if (!name) continue
      names.set(phone, name)
      fresh.push({ phone, display_name: name, source: 'greenapi' })
    }
    if (fresh.length > 0) {
      // ignoreDuplicates so a name someone corrected by hand survives.
      await admin.from('wa_contacts').upsert(fresh, {
        onConflict: 'phone',
        ignoreDuplicates: true,
      })
    }
  }

  return text.replace(MENTION, (whole, phone) => {
    const name = names.get(phone)
    return name ? `@${name}` : whole
  })
}
