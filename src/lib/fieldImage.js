// One filled box as a transparent PNG, ready to be stamped onto the PDF.
//
// Why images and not PDF text: a PDF library draws Hebrew letters in the order
// they are stored — left to right — so "דני כהן" would come out reversed, and
// mixed lines ("16,800 ₪ בתשלומים") need the full bidi algorithm on top. The
// browser already has that algorithm and the Heebo font; a canvas with
// direction set to rtl draws the text exactly as the client saw it. The edge
// function then places each image at the box's position on the office's own PDF.

import { displayValue } from './formFields'

const FONT = 'Heebo, "Segoe UI", Arial, sans-serif'
// Pixels per PDF point. 4 → a 12pt line is ~48px tall: crisp when printed.
const DENSITY = 4

let fontReady = null
function ensureFont() {
  fontReady ||= Promise.all(
    [400, 600].map((w) => document.fonts?.load(`${w} 40px Heebo`).catch(() => null))
  ).catch(() => null)
  return fontReady
}

/**
 * Render `field`'s value for a page of `pageW`×`pageH` PDF points.
 * Returns a base64 PNG (without the data: prefix), or null for an empty box.
 */
export async function renderFieldImage(field, value, pageW, pageH, signatureDataUrl = null) {
  await ensureFont()
  const wPt = field.w * pageW
  const hPt = field.h * pageH
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(wPt * DENSITY))
  canvas.height = Math.max(1, Math.round(hPt * DENSITY))
  const ctx = canvas.getContext('2d')
  const W = canvas.width
  const H = canvas.height

  if (field.type === 'signature') {
    if (!signatureDataUrl) return null
    const img = await loadImage(signatureDataUrl)
    // Fit inside the box, keeping the stroke's proportions.
    const s = Math.min(W / img.width, H / img.height)
    const dw = img.width * s
    const dh = img.height * s
    ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh)
    return canvas.toDataURL('image/png').split(',')[1]
  }

  if (field.type === 'checkbox') {
    if (!value) return null
    const m = Math.min(W, H)
    ctx.strokeStyle = '#0b2e6b'
    ctx.lineWidth = m * 0.14
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(W / 2 - m * 0.32, H / 2)
    ctx.lineTo(W / 2 - m * 0.08, H / 2 + m * 0.26)
    ctx.lineTo(W / 2 + m * 0.36, H / 2 - m * 0.3)
    ctx.stroke()
    return canvas.toDataURL('image/png').split(',')[1]
  }

  const text = displayValue(field, value)
  if (!text) return null
  ctx.direction = 'rtl'
  ctx.fillStyle = '#0b2e6b' // ink blue — reads as "filled in", distinct from the print
  ctx.textBaseline = 'middle'

  if (field.type === 'textarea') {
    const size = Math.min(H * 0.28, 11 * DENSITY)
    ctx.font = `500 ${size}px ${FONT}`
    const lines = wrapLines(ctx, text, W * 0.96)
    const lh = size * 1.3
    const top = Math.max(size * 0.7, (H - lines.length * lh) / 2 + lh / 2)
    lines.forEach((line, i) => {
      ctx.textAlign = 'right'
      ctx.fillText(line, W * 0.98, top + i * lh)
    })
    return canvas.toDataURL('image/png').split(',')[1]
  }

  // One line: as large as the box allows (capped at ~12pt), shrunk to fit.
  let size = Math.min(H * 0.72, 12 * DENSITY)
  ctx.font = `500 ${size}px ${FONT}`
  while (size > 6 && ctx.measureText(text).width > W * 0.96) {
    size -= 1
    ctx.font = `500 ${size}px ${FONT}`
  }
  // Numbers, mails and phones read left to right even in a Hebrew form, and
  // look wrong hugging the right edge of a box that is mostly empty.
  const ltr = /^(number|phone|email|idNumber|date)$/.test(field.type)
  ctx.textAlign = ltr ? 'center' : 'right'
  ctx.fillText(text, ltr ? W / 2 : W * 0.98, H / 2)
  return canvas.toDataURL('image/png').split(',')[1]
}

function wrapLines(ctx, text, maxW) {
  const out = []
  for (const para of String(text).split(/\n/)) {
    let cur = ''
    for (const w of para.split(/\s+/)) {
      const next = cur ? `${cur} ${w}` : w
      if (cur && ctx.measureText(next).width > maxW) {
        out.push(cur)
        cur = w
      } else cur = next
    }
    out.push(cur)
  }
  return out
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

/** The signer's name as an image, for the English certificate page. */
export async function renderNameImage(name) {
  await ensureFont()
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  const size = 44
  ctx.font = `600 ${size}px ${FONT}`
  const w = Math.ceil(ctx.measureText(name).width) + 16
  canvas.width = Math.max(40, w)
  canvas.height = 64
  ctx.font = `600 ${size}px ${FONT}`
  ctx.direction = 'rtl'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#111827'
  ctx.fillText(name, canvas.width - 8, 32)
  return canvas.toDataURL('image/png').split(',')[1]
}

/**
 * A photo attachment shrunk for upload: longest side 1600px, JPEG. A phone
 * photo is 4-8MB; the evidence needs to be legible, not a print.
 */
export async function compressImage(file, maxSide = 1600) {
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    const s = Math.min(1, maxSide / Math.max(img.width, img.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.width * s)
    canvas.height = Math.round(img.height * s)
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.82)
  } finally {
    URL.revokeObjectURL(url)
  }
}
