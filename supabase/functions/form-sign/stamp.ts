// Building the signed PDF — separate from the HTTP handler so it can be run
// and checked on its own (see the note in index.ts).
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1'

export type Field = { id: string; type: string; filler: string; page: number; x: number; y: number; w: number; h: number }
export type CertInfo = {
  requestId: string
  templateId: string | null
  initiator: string | null
  phone: string | null
  email: string | null
  ip: string | null
  ua: string | null
  signedAt: Date
  valuesHash: string
  trail: { kind: string; actor: string | null; ip: string | null; at: string }[]
  nameImage?: string | null // base64 PNG of the signer's name (Hebrew)
}

const b64ToBytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
/** WinAnsi-safe text for the certificate page (Hebrew goes in as images). */
const ascii = (s: unknown) => String(s ?? '').replace(/[^\x20-\x7E]/g, '?').slice(0, 160)
const isAscii = (s: unknown) => /^[\x20-\x7E]*$/.test(String(s ?? ''))
/** Who did a step, in words the standard font can print. Agents' names are Hebrew. */
const actorLabel = (a: string | null) => (!a ? '' : a === 'client' ? 'client' : isAscii(a) ? a : 'R.E.S agent')

export const ilTime = (d: Date) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(d)

/**
 * The office's template PDF, with every box stamped at its place, attachments
 * appended, and a certificate page last. Returns the PDF bytes.
 *
 * `images` holds the client's boxes (drawn by their browser), `senderImages`
 * the agent's (saved at send time) — the caller decides which is which.
 */
export async function buildSignedPdf({
  templateBytes,
  fields,
  images,
  senderImages,
  attachments,
  cert,
}: {
  templateBytes: Uint8Array
  fields: Field[]
  images: Record<string, string>
  senderImages: Record<string, string>
  attachments: { fieldId: string; bytes: Uint8Array }[]
  cert: CertInfo
}): Promise<Uint8Array> {
  const doc = await PDFDocument.load(templateBytes)
  const pages = doc.getPages()

  for (const f of fields) {
    if (f.type === 'attachment') continue
    const b64 = f.filler === 'sender' ? senderImages[f.id] : images[f.id]
    const page = pages[f.page]
    if (!b64 || !page) continue
    // The box is measured against the page as shown (its crop box), which is
    // what pdf.js rendered the page images from.
    const box = page.getCropBox()
    const png = await doc.embedPng(b64ToBytes(b64))
    page.drawImage(png, {
      x: box.x + f.x * box.width,
      y: box.y + box.height - (f.y + f.h) * box.height,
      width: f.w * box.width,
      height: f.h * box.height,
    })
  }

  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  let n = 0
  for (const a of attachments) {
    const img = await doc.embedJpg(a.bytes)
    const pg = doc.addPage([595.28, 841.89])
    n += 1
    pg.drawText(`Attachment ${n}`, { x: 40, y: 800, size: 12, font: bold })
    const s = Math.min(515 / img.width, 730 / img.height, 1.5)
    pg.drawImage(img, { x: 40 + (515 - img.width * s) / 2, y: 50 + (730 - img.height * s) / 2, width: img.width * s, height: img.height * s })
  }

  // ── Certificate page ──
  const pg = doc.addPage([595.28, 841.89])
  let y = 790
  const line = (label: string, value: string, size = 10) => {
    pg.drawText(label, { x: 50, y, size: 9, font: bold, color: rgb(0.35, 0.38, 0.45) })
    pg.drawText(ascii(value), { x: 180, y, size, font, color: rgb(0.07, 0.09, 0.15) })
    y -= 20
  }
  pg.drawRectangle({ x: 0, y: 815, width: 595.28, height: 27, color: rgb(0.98, 0.75, 0.14) })
  pg.drawText('Electronic Signature Certificate', { x: 50, y, size: 18, font: bold })
  y -= 16
  pg.drawText('R.E.S College - issued by the signing system at the moment of signature', { x: 50, y, size: 9, font, color: rgb(0.4, 0.43, 0.5) })
  y -= 34
  line('Document ID', cert.requestId)
  line('Form', `template ${cert.templateId || '-'}`)
  const nameY = y
  line('Signer', '')
  if (cert.nameImage) {
    const nm = await doc.embedPng(b64ToBytes(cert.nameImage))
    const h = 16
    pg.drawImage(nm, { x: 180, y: nameY - 4, width: (nm.width / nm.height) * h, height: h })
  }
  line('Phone', cert.phone || '-')
  line('Email', cert.email || '-')
  line('Signed at (Israel)', ilTime(cert.signedAt))
  line('Signed at (UTC)', cert.signedAt.toISOString())
  line('IP address', cert.ip || '-')
  line('Device', (cert.ua || '-').slice(0, 95), 8)
  line('Sent by', cert.initiator ? actorLabel(cert.initiator) : '-')
  y -= 6
  pg.drawText('Consent: the signer confirmed having read the document and agreeing to its terms', { x: 50, y, size: 10, font })
  y -= 14
  pg.drawText('before signing ("I have read and agree").', { x: 50, y, size: 10, font })
  y -= 26
  line('Values SHA-256', cert.valuesHash, 8)
  y -= 10
  pg.drawText('Audit trail', { x: 50, y, size: 11, font: bold })
  y -= 18
  for (const e of cert.trail) {
    pg.drawText(`${ilTime(new Date(e.at))}   ${ascii(e.kind).padEnd(10)}  ${actorLabel(e.actor)}  ${ascii(e.ip || '')}`, { x: 60, y, size: 9, font })
    y -= 14
    if (y < 170) break
  }
  const sigField = fields.find((f) => f.type === 'signature' && f.filler !== 'sender' && images[f.id])
  if (sigField) {
    const sig = await doc.embedPng(b64ToBytes(images[sigField.id]))
    const w = Math.min(260, (sig.width / sig.height) * 70)
    pg.drawText('Signature', { x: 50, y: 150, size: 9, font: bold, color: rgb(0.35, 0.38, 0.45) })
    pg.drawImage(sig, { x: 180, y: 110, width: w, height: (w / sig.width) * sig.height })
  }
  pg.drawText('The SHA-256 of this PDF is recorded in the system at signing; any later change to the file is detectable.', { x: 50, y: 50, size: 8, font, color: rgb(0.4, 0.43, 0.5) })

  doc.setTitle(`Signed form ${cert.requestId}`)
  doc.setProducer('R.E.S forms')
  return await doc.save()
}
