// דוח יומי as an image — a card designed to be read on a phone inside WhatsApp,
// not a screenshot of the page.
//
// Drawn straight onto a canvas rather than by rasterising the DOM. The DOM
// route (html2canvas and friends) mangles Hebrew — right-to-left runs come out
// reversed — and depends on how each browser paints a cloned page; a canvas
// with the text direction set draws the same card everywhere, iPhone
// included, with no library.
//
// Takes the report built by lib/dailyReport.js, so the picture, the page and
// the WhatsApp text can never say different things.

const W = 1080
const PAD = 56
const SCALE = 2 // 2160px wide: crisp after WhatsApp recompresses it
const FONT = 'Heebo, "Segoe UI", Arial, sans-serif'

const C = {
  bgTop: '#0d1830',
  bgBottom: '#030712',
  gold: '#fbbf24',
  goldSoft: '#fde68a',
  white: '#ffffff',
  text: '#e2e8f0',
  muted: '#94a3b8',
  dim: '#64748b',
  line: 'rgba(255,255,255,0.08)',
  tile: 'rgba(255,255,255,0.055)',
  green: '#4ade80',
  rose: '#fb7185',
  amber: '#fbbf24',
  violet: '#c4b5fd',
  emerald: '#6ee7b7',
  sky: '#7dd3fc',
}

const shekel = (v) => `₪${Math.round(Number(v) || 0).toLocaleString('en-US')}`

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function setFont(ctx, size, weight) {
  ctx.font = `${weight} ${size}px ${FONT}`
}

/** Draw text, shrinking it until it fits `maxW` (never below 60% of `size`). */
function text(ctx, str, x, y, { size = 26, weight = 600, color = C.text, align = 'right', maxW = 0 } = {}) {
  let s = size
  setFont(ctx, s, weight)
  if (maxW) {
    while (s > size * 0.6 && ctx.measureText(str).width > maxW) {
      s -= 1
      setFont(ctx, s, weight)
    }
  }
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.fillText(str, x, y)
}

/** Break a line of Hebrew into lines no wider than `maxW`. */
function wrap(ctx, str, maxW, size, weight) {
  setFont(ctx, size, weight)
  const words = String(str).split(/\s+/)
  const lines = []
  let cur = ''
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w
    if (cur && ctx.measureText(next).width > maxW) {
      lines.push(cur)
      cur = w
    } else cur = next
  }
  if (cur) lines.push(cur)
  return lines
}

const TABLE_COLS = [
  // key, label, width — right to left, the way the card is read.
  ['name', 'סוכן', 196],
  ['booked', 'נקבעו', 104],
  ['came', 'הגיעו', 120],
  ['unmarked', 'לא סומנו', 120],
  ['deals', 'עסקאות', 184],
  ['collected', 'נגבה', 136],
  ['calls', 'שיחות', 108],
]

const ROW_H = 66
const isActive = (r) => r.booked || r.held || r.deals || r.collected || r.reported || r.calls

/**
 * Render the card. Resolves to { jpeg, png } Blobs of the same image.
 * `dateLabel` is the long date ("יום שני, 14 בספטמבר 2026").
 */
export async function renderReportImage(report, { dateLabel, generatedAt = new Date() }) {
  // Heebo is on the page already; make sure the weights the card uses are
  // decoded before drawing, or the first image comes out in a fallback font.
  try {
    await Promise.all([600, 700, 800, 900].map((w) => document.fonts?.load(`${w} 40px Heebo`)))
  } catch {
    /* a fallback font is still a readable card */
  }

  const { rows, totals: t, flags } = report
  const active = rows.filter(isActive)
  const idle = rows.filter((r) => !isActive(r)).map((r) => r.name)

  // ── Measure first, so the canvas is exactly as tall as its content ──
  const probe = document.createElement('canvas').getContext('2d')
  const innerW = W - PAD * 2
  const flagLines = flags.map((f) => wrap(probe, f.text, innerW - 110, 25, 600))
  const idleLines = idle.length ? wrap(probe, `ללא פעילות היום: ${idle.join(', ')}`, innerW, 22, 600) : []

  const HEADER_H = 218
  const KPI_TOP = HEADER_H + 30
  const TILE_H = 178
  const GAP = 22
  const TABLE_TOP = KPI_TOP + TILE_H * 2 + GAP + 56
  const tableH = 56 + 54 + active.length * ROW_H + 72
  let y = TABLE_TOP + tableH
  const idleTop = y + 14
  if (idleLines.length) y += 20 + idleLines.length * 32
  const flagsTop = y + 34
  const flagsH = flags.length ? 34 + flagLines.reduce((s, l) => s + l.length * 36 + 12, 0) + 22 : 0
  if (flags.length) y = flagsTop + flagsH
  const H = y + 96

  const canvas = document.createElement('canvas')
  canvas.width = W * SCALE
  canvas.height = H * SCALE
  const ctx = canvas.getContext('2d')
  ctx.scale(SCALE, SCALE)
  ctx.direction = 'rtl'
  ctx.textBaseline = 'alphabetic'

  // ── Ground ──
  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, C.bgTop)
  bg.addColorStop(1, C.bgBottom)
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)
  const glow = ctx.createRadialGradient(W * 0.85, 40, 10, W * 0.85, 40, 560)
  glow.addColorStop(0, 'rgba(251,191,36,0.16)')
  glow.addColorStop(1, 'rgba(251,191,36,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, 620)
  const bar = ctx.createLinearGradient(0, 0, W, 0)
  bar.addColorStop(0, '#d97706')
  bar.addColorStop(0.5, '#fde047')
  bar.addColorStop(1, '#f59e0b')
  ctx.fillStyle = bar
  ctx.fillRect(0, 0, W, 8)

  // ── Header ──
  text(ctx, 'דוח יומי', W - PAD, 120, { size: 76, weight: 900, color: C.white })
  text(ctx, dateLabel, W - PAD, 172, { size: 31, weight: 600, color: C.muted })
  text(ctx, 'R.E.S', PAD, 112, { size: 50, weight: 900, color: C.gold, align: 'left' })
  text(ctx, 'מכללת נדל״ן', PAD, 150, { size: 23, weight: 600, color: C.muted, align: 'left' })
  ctx.fillStyle = C.line
  ctx.fillRect(PAD, HEADER_H, innerW, 2)

  // ── Six numbers ──
  const marked = t.attended + t.noShow
  const tiles = [
    {
      label: 'פגישות שנקבעו',
      value: String(t.booked),
      sub: `פרונטלי ${t.frontal} · זום ${t.zoom}`,
      accent: C.gold,
      // Words, not ▲/▼: an arrow glyph in a right-to-left line lands on
      // whichever side the bidi rules pick, and the first draft's collided
      // with the label.
      badge: t.paceAvg
        ? t.booked >= t.paceAvg
          ? { text: `מעל הממוצע (${t.paceAvg})`, color: C.green }
          : { text: `מתחת לממוצע (${t.paceAvg})`, color: C.amber }
        : null,
    },
    {
      label: 'הגיעו לפגישות',
      value: marked ? `${t.attended}/${marked}` : '—',
      sub:
        [
          t.attendanceRate != null && !t.unmarked && `${t.attendanceRate}% הגעה`,
          t.unmarked && `${t.unmarked} לא סומנו`,
          t.upcoming && `${t.upcoming} בהמשך היום`,
        ]
          .filter(Boolean)
          .join(' · ') || (t.held ? `${t.held} פגישות` : 'אין פגישות ביום זה'),
      accent: C.green,
    },
    {
      label: 'עסקאות',
      value: String(t.deals),
      sub: t.deals ? shekel(t.dealAmount) : 'לא נסגרו עסקאות',
      accent: C.violet,
      subColor: t.deals ? C.violet : C.muted,
    },
    { label: 'נגבה', value: shekel(t.collected), sub: 'חיובים לתאריך זה', accent: C.emerald },
    { label: 'שיחות', value: String(t.calls), sub: `מעל 4 דק׳: ${t.longCalls}`, accent: C.sky },
    {
      label: 'שלחו סיכום',
      value: `${t.reported}/${t.expected}`,
      sub: t.reported >= t.expected ? 'כולם דיווחו' : `חסרים ${t.expected - t.reported}`,
      accent: C.muted,
    },
  ]
  const tileW = (innerW - GAP * 2) / 3
  tiles.forEach((tile, i) => {
    const col = i % 3
    const row = Math.floor(i / 3)
    const x = W - PAD - (col + 1) * tileW - col * GAP
    const ty = KPI_TOP + row * (TILE_H + GAP)
    roundRect(ctx, x, ty, tileW, TILE_H, 26)
    ctx.fillStyle = C.tile
    ctx.fill()
    ctx.strokeStyle = C.line
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.fillStyle = tile.accent
    roundRect(ctx, x + tileW - 30, ty + 30, 8, 28, 4)
    ctx.fill()
    text(ctx, tile.label, x + tileW - 48, ty + 54, { size: 25, weight: 700, color: C.text, maxW: tileW - 76 })
    // The badge sits beside the number, on the side the number leaves empty.
    if (tile.badge) {
      text(ctx, tile.badge.text, x + 24, ty + 116, {
        size: 20,
        weight: 700,
        color: tile.badge.color,
        align: 'left',
        maxW: tileW * 0.5,
      })
    }
    text(ctx, tile.value, x + tileW - 28, ty + 124, {
      size: 62,
      weight: 900,
      color: C.white,
      maxW: tileW - 56 - (tile.badge ? tileW * 0.5 : 0),
    })
    text(ctx, tile.sub, x + tileW - 28, ty + 158, {
      size: 22,
      weight: 600,
      color: tile.subColor || C.muted,
      maxW: tileW - 56,
    })
  })

  // ── Per agent ──
  text(ctx, 'לפי סוכן', W - PAD, TABLE_TOP + 34, { size: 32, weight: 800, color: C.gold })
  const headY = TABLE_TOP + 56
  roundRect(ctx, PAD, headY, innerW, 50, 14)
  ctx.fillStyle = 'rgba(255,255,255,0.05)'
  ctx.fill()

  // Column centres, right to left.
  const cols = []
  let edge = W - PAD
  for (const [key, label, w] of TABLE_COLS) {
    cols.push({ key, label, w, right: edge, center: edge - w / 2 })
    edge -= w
  }
  for (const c of cols) {
    if (c.key === 'name') text(ctx, c.label, c.right - 20, headY + 33, { size: 21, weight: 700, color: C.muted })
    else text(ctx, c.label, c.center, headY + 33, { size: 21, weight: 700, color: C.muted, align: 'center' })
  }

  const cell = (c, value, color, rowY, size = 29, weight = 800) => {
    if (c.key === 'name') text(ctx, value, c.right - 20, rowY, { size: 28, weight: 700, color, maxW: c.w - 30 })
    else text(ctx, value, c.center, rowY, { size, weight, color, align: 'center', maxW: c.w - 14 })
  }

  let ry = headY + 54
  active.forEach((r, i) => {
    if (i % 2 === 1) {
      ctx.fillStyle = 'rgba(255,255,255,0.025)'
      ctx.fillRect(PAD, ry, innerW, ROW_H)
    }
    const base = ry + 43
    const m = r.attended + r.noShow
    for (const c of cols) {
      if (c.key === 'name') cell(c, r.name, C.white, base)
      else if (c.key === 'booked') cell(c, String(r.booked), r.booked ? C.white : C.dim, base)
      else if (c.key === 'came') cell(c, m ? `${r.attended}/${m}` : '—', m ? C.green : C.dim, base)
      else if (c.key === 'unmarked') {
        cell(c, r.unmarked ? String(r.unmarked) : '—', r.unmarked ? C.amber : C.dim, r.upcoming ? base - 8 : base)
        if (r.upcoming) text(ctx, `+${r.upcoming} בהמשך`, c.center, base + 16, { size: 16, weight: 600, color: C.muted, align: 'center' })
      } else if (c.key === 'deals') {
        cell(c, r.deals ? `${r.deals} · ${shekel(r.dealAmount)}` : '—', r.deals ? C.violet : C.dim, base, 25)
      } else if (c.key === 'collected') cell(c, r.collected ? shekel(r.collected) : '—', r.collected ? C.emerald : C.dim, base, 25)
      else if (c.key === 'calls') cell(c, r.calls == null ? '—' : String(r.calls), r.calls == null ? C.dim : C.white, base)
    }
    ctx.fillStyle = C.line
    ctx.fillRect(PAD, ry + ROW_H - 1, innerW, 1)
    ry += ROW_H
  })

  // Totals
  roundRect(ctx, PAD, ry + 8, innerW, 60, 16)
  ctx.fillStyle = 'rgba(251,191,36,0.12)'
  ctx.fill()
  const ty2 = ry + 48
  for (const c of cols) {
    if (c.key === 'name') cell(c, 'סה״כ', C.gold, ty2)
    else if (c.key === 'booked') cell(c, String(t.booked), C.gold, ty2)
    else if (c.key === 'came') cell(c, marked ? `${t.attended}/${marked}` : '—', C.gold, ty2)
    else if (c.key === 'unmarked') cell(c, String(t.unmarked), C.gold, ty2)
    else if (c.key === 'deals') cell(c, `${t.deals} · ${shekel(t.dealAmount)}`, C.gold, ty2, 25)
    else if (c.key === 'collected') cell(c, shekel(t.collected), C.gold, ty2, 25)
    else if (c.key === 'calls') cell(c, String(t.calls), C.gold, ty2)
  }

  if (idleLines.length) {
    idleLines.forEach((line, i) => {
      text(ctx, line, W - PAD, idleTop + 28 + i * 32, { size: 22, weight: 600, color: C.dim })
    })
  }

  // ── Needs a hand ──
  if (flags.length) {
    roundRect(ctx, PAD, flagsTop, innerW, flagsH, 22)
    ctx.fillStyle = 'rgba(251,191,36,0.08)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(251,191,36,0.35)'
    ctx.lineWidth = 1.5
    ctx.stroke()
    let fy = flagsTop + 34
    flagLines.forEach((lines) => {
      // A drawn warning mark — emoji fonts are not the same on every device.
      const cx = W - PAD - 42
      const cy = fy + 16
      ctx.fillStyle = C.amber
      ctx.beginPath()
      ctx.arc(cx, cy, 15, 0, Math.PI * 2)
      ctx.fill()
      text(ctx, '!', cx, cy + 9, { size: 24, weight: 900, color: '#1f2937', align: 'center' })
      lines.forEach((line, i) => {
        text(ctx, line, W - PAD - 72, fy + 26 + i * 36, { size: 25, weight: 600, color: C.goldSoft })
      })
      fy += lines.length * 36 + 12
    })
  }

  // ── Footer ──
  const time = generatedAt.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
  ctx.fillStyle = C.line
  ctx.fillRect(PAD, H - 72, innerW, 1)
  text(ctx, `הופק ב-${time} · מכללת R.E.S`, W / 2, H - 34, { size: 21, weight: 600, color: C.dim, align: 'center' })

  // Two encodings of the same card. The PNG came out at ~2MB (the gradients do
  // not compress), too heavy to send on a phone; a high-quality JPEG is a
  // fraction of that and WhatsApp re-encodes to JPEG anyway. The PNG stays for
  // the clipboard, where browsers accept nothing else.
  const encode = (type, quality) =>
    new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('image_failed'))), type, quality)
    )
  const [jpeg, png] = await Promise.all([encode('image/jpeg', 0.92), encode('image/png')])
  return { jpeg, png }
}
