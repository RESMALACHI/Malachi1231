// Common ground for the panel that rides along on BMBY's own pages.
//
// Chrome injects all of an extension's content scripts into ONE shared scope, so
// a `const` declared in one file collides with the same name in another. Anything
// used by more than one file therefore lives here on a single object — which has
// the happy side effect of making each file's dependencies explicit.
//
// Load order is set by the manifest: this file first, then meetings.js, then
// boot.js, which decides what actually gets shown.

const RES = (() => {
  const API = 'https://uhmzdhtjabhbcyslovfk.supabase.co/functions/v1/crm-bridge'

  // A choice made on the lead page is only honoured for a short while. Any longer
  // and a stale pick from an hour ago would silently fill someone else's form.
  const HANDOFF_TTL_MS = 120_000

  // Our agent names → BMBY user ids, read from the form's own CRM_TaskOwnerUserID
  // options. If BMBY ever renumbers a user this is the one place to correct.
  const BMBY_USER = {
    'מלאכי אזערי': '69185',
    'ודיע': '54034',
    'מרים': '69186',
    'עדי': '68923',
    'איציק': '46577',
  }

  const FIELD = {
    type: 'CRM_TaskType',
    date: 'CRM_Date',
    // BMBY's date is really two fields: a readonly "calendar" input showing
    // dd/mm/yyyy, and a HIDDEN companion that submit actually reads. Filling
    // only the visible one made the form LOOK right and then save today's date —
    // because the hidden field kept its default. Both must be set.
    dateHidden: 'date_CRM_Date',
    hourStart: 'HourStart',
    minuteStart: 'MinuteStart',
    hourEnd: 'HourEnd',
    minuteEnd: 'MinuteEnd',
    subject: 'CRM_Subject',
    message: 'CRM_Message',
    owner: 'CRM_TaskOwnerUserID',
    priority: 'CRM_Priority',
  }

  // Values taken from the form's own <option> lists, not guessed.
  const TASK = { meeting: 'Appointment' }
  // CRM_Priority is really a category: medium = "פגישת מכירה".
  const PRIORITY = { sales: 'medium' }

  // ── Reading a calendar entry ───────────────────────────────────────────────
  // Titles and descriptions are free text people typed by hand, carrying
  // boilerplate, the agent's name, a phone number and status notes all at once.
  const WORDCHAR = 'A-Za-z0-9\\u05D0-\\u05EA'
  const wordG = (src) => new RegExp(`(?<![${WORDCHAR}])(?:${src})(?![${WORDCHAR}])`, 'gu')

  function clientName(title, agent) {
    let t = String(title || '').replace(/\s+/g, ' ').trim()
    t = t.replace(/^פגיש(?:ה|ת)\s*/u, '')
    t = t.replace(wordG('ייעוץ|יעוץ|זום|פרונטלית|פרונטלי|יועצת|יועץ|עם|מקבל|מקבלת'), ' ')
    if (agent) {
      t = t.replace(wordG(agent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), ' ')
      const first = agent.split(' ')[0]
      if (first && first.length >= 3) t = t.replace(wordG(first), ' ')
    }
    t = t.replace(wordG('אישר|אישרה|אישרו|מאשר|מאשרת|מאשרים|בוטל|בוטלה|מבוטל|מבוטלת|הגעה|נקבע'), ' ')
    t = t.replace(/ללא מענה|לא ענה|אין מענה|לא עונה/gu, ' ')
    t = t.replace(wordG('פעמיים|פעמים|הרבה'), ' ')
    t = t.replace(wordG('צחר|צח["״]ר|רמת גן|ר["״]ג|חיפה'), ' ')
    t = t.replace(/\d[\d\-– ]{7,14}\d/g, ' ')
    t = t.replace(/[-–—·|]+/g, ' ').replace(/\s+/g, ' ').replace(/^[\s,.!:]+|[\s,.!:]+$/g, '').trim()
    return t || 'פגישת ייעוץ'
  }

  // The calendar description is the whole ".פגישה" message, and it crosses into
  // BMBY almost whole — the office wants the full context (who booked, when, the
  // story) right there on the task. The ONE thing that must not cross is the
  // client's phone number, in any of its shapes.
  //
  // NOTE: no \b after the Hebrew words. JavaScript's word boundary is defined on
  // [A-Za-z0-9_], so between a Hebrew letter and a colon there is no boundary at
  // all — with \b these patterns matched nothing and every labelled line survived.
  const PHONE_LABEL = /^(טלפון|נייד|פלאפון|פלאפו|סלולרי|מספר)[^:：\n]{0,14}[:：]/u
  // A leading @ is swallowed with the digits: WhatsApp mentions arrive as
  // "@9725…", and stripping only the number would leave a bare @ behind.
  // Times ("18:00") and dates ("27/07") survive — colon and slash are not in
  // the run's character class, so they cut it short of the 9-digit minimum.
  const PHONE_RUN = /@?\+?\d[\d\-– ]{7,14}\d/g

  // Google Calendar hands the description over in two shapes. When someone
  // pastes formatted text, every line comes wrapped in HTML — <p>…</p>, <br>,
  // the odd <b><strong> — and entities like &nbsp;. And whenever a Meet link is
  // attached, Google appends its own two-line block. Both are noise on a BMBY
  // task, so the HTML is flattened to plain lines and the Meet block dropped
  // before the phone/mention stripping runs.

  /** Block tags → line breaks, every other tag removed, common entities decoded. */
  function htmlToText(s) {
    return String(s || '')
      .replace(/<\s*\/?(p|div|br|li|tr)\b[^>]*>/gi, '\n') // line-level tags → newline
      .replace(/<[^>]+>/g, '') // any remaining tag → gone
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#0*39;|&apos;/gi, "'")
      .replace(/&#(\d{1,5});/g, (_, n) => String.fromCodePoint(Number(n)))
  }

  // Google's own appended lines, in any language variant we might meet, plus the
  // two hosts it links to — dropped whether or not they sit on a labelled line.
  const GOOGLE_NOISE = /^(join with google meet|learn more about meet)/i
  const NOISE_URL = /(meet\.google\.com|support\.google\.com)/i

  function cleanDescription(text) {
    return htmlToText(text)
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !PHONE_LABEL.test(l) && !GOOGLE_NOISE.test(l) && !NOISE_URL.test(l))
      .map((l) => l.replace(PHONE_RUN, ' ').replace(/\s+/g, ' ').trim())
      // A line that was ONLY a phone number (or leftover punctuation) is dropped.
      .filter((l) => l && !/^[\s\-–—·|:,.@()*]+$/.test(l))
      .join('\n')
      .trim()
  }

  /**
   * What BMBY's subject line should say: the "סוג:" value out of the calendar
   * description — "זום", "פרונטלי", whatever the booker wrote. BMBY prints the
   * client's name on the task by itself (the שם field), so repeating the name
   * in the subject said nothing; the type is the part the eye actually needs.
   * Meetings that never went through the bot have no "סוג:" line, and fall back
   * to the type the calendar sync worked out.
   */
  function meetingSubject(meeting) {
    // Flattened first — a "סוג:" line wrapped in <p>…</p> would never match raw.
    for (const line of htmlToText(meeting?.description).split(/\r?\n/)) {
      const m = line.trim().match(/^סוג\s*[:：]\s*(.+)$/u)
      if (m && m[1].trim()) return m[1].trim()
    }
    if (meeting?.type === 'zoom') return 'זום'
    if (meeting?.type === 'frontal') return 'פרונטלי'
    return 'פגישה'
  }

  // ── Matching a meeting to the lead whose page this is ──────────────────────
  //
  // By phone number, not by name. Names are written three ways ("חן" / "חן ורד" /
  // "ורהן"), get typed with the agent's name glued on, and a short one like "חן"
  // matches half the list. A phone number is exact.
  //
  // Nothing here leaves the browser: the numbers are read off the page, compared
  // against the list already loaded, and thrown away. Neither the number nor the
  // lead's name is ever sent to our server.

  /** Normalise anything phone-shaped to one 10-digit Israeli mobile, or null. */
  function toMobile(raw) {
    const d = String(raw).replace(/\D/g, '')
    if (d.length === 10 && d.startsWith('05')) return d
    if (d.length === 9 && d.startsWith('5')) return `0${d}`
    if (d.length === 12 && d.startsWith('9725')) return `0${d.slice(3)}`
    return null
  }

  /**
   * The client's phone as typed into the calendar — mirrors clientPhone() in
   * src/lib/meetingTitle.js. Agents write it inconsistently and often drop the
   * leading zero, so digits are pulled out and normalised.
   */
  function meetingPhone(m) {
    const src = `${m?.title || ''} ${m?.description || ''}`
    for (const raw of src.match(/\d[\d\-– ]{7,14}\d/g) || []) {
      const p = toMobile(raw)
      if (p) return p
    }
    return null
  }

  /**
   * Every phone number visible on this BMBY page, best candidates first.
   *
   * Click-to-dial links lead, because those are the lead's OWN numbers. Page
   * text follows in document order, which puts the header before the activity
   * log — and the log quotes other numbers inside old SMS bodies ("השב להסרה…
   * 0529999981") that must never win over the real one.
   */
  function pagePhones() {
    const out = []
    const seen = new Set()
    const add = (raw) => {
      const p = toMobile(raw)
      if (p && !seen.has(p)) {
        seen.add(p)
        out.push(p)
      }
    }
    document
      .querySelectorAll('a[href^="tel:"], a[href^="callto:"], a[href^="sip:"]')
      .forEach((a) => add(a.getAttribute('href') || ''))
    // innerText for preference — it sees the page as rendered, so numbers hidden
    // in collapsed panels or <script> blocks stay out. textContent is the
    // fallback for environments that do not implement it.
    const body = document.body
    const text = (body && (body.innerText ?? body.textContent)) || ''
    for (const raw of text.match(/\d[\d\-– ]{7,14}\d/g) || []) add(raw)
    return out
  }

  const CANDIDATES = 'a,span,div,td,th,b,strong,p,li,h1,h2,h3,h4,h5'

  const depthOf = (node) => {
    let d = 0
    for (let p = node; p; p = p.parentElement) d++
    return d
  }

  /**
   * Where on BMBY's page to hang the match card.
   *
   * The phone comes first and is the reliable one: the click-to-dial pill is
   * printed once, in the main detail block, so there is nothing to confuse it
   * with. Matching on digits only, because the pill carries an icon and BMBY
   * may punctuate the number differently from the calendar.
   *
   * The name is the fallback, and it needs a tie-break: BMBY prints the lead's
   * name twice, once as the page header and once in the sidebar, at the same
   * DOM depth. Anchoring to the sidebar copy puts the card straight under our
   * own panel — which is exactly what happened the first time. The page header
   * is set larger, so font size decides.
   *
   * Deepest match wins throughout: the label itself, not a wrapper that happens
   * to contain only the label.
   */
  function pageAnchor(phone, name) {
    const digits = String(phone || '').replace(/\D/g, '')
    if (digits.length >= 9) {
      let best = null
      for (const node of document.querySelectorAll(CANDIDATES)) {
        const d = (node.textContent || '').replace(/\D/g, '')
        if (d !== digits && d !== digits.slice(1)) continue
        if (!best || depthOf(node) > depthOf(best)) best = node
      }
      if (best) return best
    }

    const want = String(name || '').replace(/\s+/g, ' ').trim()
    if (want.length < 2) return null

    let best = null
    let bestScore = null
    for (const node of document.querySelectorAll(CANDIDATES)) {
      if ((node.textContent || '').replace(/\s+/g, ' ').trim() !== want) continue
      const size = parseFloat(getComputedStyle(node).fontSize) || 0
      const score = [size, depthOf(node)]
      if (!bestScore || score[0] > bestScore[0] || (score[0] === bestScore[0] && score[1] > bestScore[1])) {
        best = node
        bestScore = score
      }
    }
    return best
  }

  /**
   * The meeting belonging to the lead on this page, or null.
   *
   * `meetings` arrives sorted by date, so the first hit on a number is the
   * nearest upcoming meeting — the one an agent recording a booking wants.
   */
  function matchMeeting(meetings) {
    const phones = pagePhones()
    if (!phones.length) return null

    const byPhone = new Map()
    for (const m of meetings) {
      const p = meetingPhone(m)
      if (p && !byPhone.has(p)) byPhone.set(p, m)
    }
    for (const p of phones) {
      if (!byPhone.has(p)) continue
      const also = meetings.filter((m) => meetingPhone(m) === p).length - 1
      return { meeting: byPhone.get(p), phone: p, also }
    }
    return null
  }

  // ── Dates ──────────────────────────────────────────────────────────────────
  const pad = (n) => String(n).padStart(2, '0')
  /** dd/mm/yyyy — what BMBY's VISIBLE calendar field shows. */
  const bmbyDate = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
  /** yyyy-mm-dd — what BMBY's HIDDEN date field (the one submit reads) holds. */
  const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const dayMonth = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`
  /** BMBY's minute dropdowns only offer five-minute steps. */
  const snapMinute = (m) => String((Math.round(m / 5) * 5) % 60)

  // ── Filling ────────────────────────────────────────────────────────────────
  // Selectors are type-specific on purpose. BMBY ships a hidden <input> AND a
  // visible <select> both named CRM_TaskType; a bare [name=…] lookup returns the
  // hidden one, which has no options, and the type would silently never be set.
  function byName(name, kind) {
    const sel =
      kind === 'select'
        ? `select[name="${name}"]`
        : `input[name="${name}"]:not([type="hidden"]), textarea[name="${name}"]`
    return document.querySelector(sel)
  }

  // Values are set AND an input/change event fired: BMBY's date field is a widget
  // that watches for those, and a silently assigned .value would look filled while
  // the page still believed it was empty.
  function setText(name, value) {
    const el = byName(name, 'text')
    if (!el || value == null) return false
    el.value = value
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    flash(el)
    return true
  }

  /**
   * Set a HIDDEN input by name. Used for BMBY's companion date field, whose
   * value is what the form actually submits. No flash — there is nothing on
   * screen to highlight — but a change event still fires, in case the calendar
   * widget listens on it.
   */
  function setHidden(name, value) {
    const el = document.querySelector(`input[name="${name}"][type="hidden"]`)
    if (!el || value == null) return false
    el.value = value
    el.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  }

  function setSelect(name, value) {
    const el = byName(name, 'select')
    if (!el) return false
    const wanted = String(value)
    const has = [...el.querySelectorAll('option')].some((o) => o.value === wanted)
    if (!has) return false
    el.value = wanted
    el.dispatchEvent(new Event('change', { bubbles: true }))
    flash(el)
    return true
  }

  /** A brief highlight, so it is obvious which fields the extension touched. */
  function flash(el) {
    const prev = el.style.backgroundColor
    el.style.transition = 'background-color .5s'
    el.style.backgroundColor = '#fef3c7'
    setTimeout(() => {
      el.style.backgroundColor = prev || ''
    }, 1600)
  }

  // ── Look & feel ────────────────────────────────────────────────────────────
  // One stylesheet, injected once. The panel borrows the app's own language —
  // white card, ink text, the gold hairline — and sets everything in Rubik,
  // bundled with the extension so BMBY's ancient Arial never leaks in. If the
  // page blocks extension fonts (none of BMBY's pages do today), the stack
  // falls back to Segoe UI, which every office machine has.
  function fontUrl(file) {
    return typeof chrome !== 'undefined' && chrome.runtime?.getURL
      ? chrome.runtime.getURL(file)
      : file
  }

  function installStyles() {
    if (document.getElementById('res-ext-style')) return
    const style = document.createElement('style')
    style.id = 'res-ext-style'
    style.textContent = `
@font-face {
  font-family: 'RES Rubik';
  font-style: normal;
  font-weight: 300 900;
  font-display: swap;
  src: url(${fontUrl('fonts/rubik-hebrew.woff2')}) format('woff2');
  unicode-range: U+0307-0308, U+0590-05FF, U+200C-2010, U+20AA, U+25CC, U+FB1D-FB4F;
}
@font-face {
  font-family: 'RES Rubik';
  font-style: normal;
  font-weight: 300 900;
  font-display: swap;
  src: url(${fontUrl('fonts/rubik-latin.woff2')}) format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
@keyframes res-spin { to { transform: rotate(360deg) } }

.res-chip { font-size: 9.5px; font-weight: 800; letter-spacing: .02em;
  padding: 1.5px 7px; border-radius: 999px; }
.res-chip-zoom { background: #eef2ff; color: #4f46e5; }
.res-chip-frontal { background: #ecfdf5; color: #047857; }

.res-inline { position: absolute; z-index: 2147483000; width: 346px; box-sizing: border-box;
  display: flex; align-items: center; gap: 12px;
  padding: 11px 13px; background: #fff;
  border: 1px solid #d3e7db; border-radius: 14px;
  box-shadow: 0 10px 28px rgba(21,101,52,.13), 0 1px 3px rgba(15,23,42,.06);
  font-family: 'RES Rubik','Segoe UI',system-ui,Arial,sans-serif;
  direction: rtl; text-align: right; }
.res-inline-badge { flex: 0 0 auto; width: 40px; height: 40px; border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #dcfce7, #a7f3d0); color: #15803d; }
.res-inline-badge svg { width: 21px; height: 21px; }
.res-inline-text { flex: 1; min-width: 0; }
.res-inline-eyebrow { font-size: 10px; font-weight: 800; letter-spacing: .03em;
  color: #16a34a; }
.res-inline-name { margin-top: 1px; font-size: 15px; font-weight: 800;
  letter-spacing: -.015em; color: #0f2417;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.res-inline-meta { margin-top: 4px; display: flex; align-items: center; gap: 6px;
  font-size: 11px; font-weight: 700; color: #64748b; font-variant-numeric: tabular-nums; }
.res-inline-btn { flex: 0 0 auto; padding: 9px 15px; border: 0; border-radius: 10px;
  background: #16a34a; color: #fff; font-family: inherit;
  font-size: 12.5px; font-weight: 800; cursor: pointer;
  box-shadow: 0 2px 8px rgba(22,163,74,.28);
  transition: background .12s, box-shadow .12s, transform .08s; }
.res-inline-btn:hover { background: #15803d; box-shadow: 0 4px 13px rgba(22,163,74,.36); }
.res-inline-btn:active { transform: translateY(1px); }
.res-inline-btn:focus-visible { outline: 2px solid #14532d; outline-offset: 2px; }

/* Flow mode: the card sits in a table row of its own inside BMBY's lead card,
   so it takes part in the layout instead of covering it. */
.res-inline--flow { position: static; width: auto; max-width: 420px;
  margin: 7px 0 8px; box-shadow: 0 4px 14px rgba(21,101,52,.10); }
.res-inline-tr > td { border: 0 !important; padding: 0 !important; }

/* The one control, sitting inside BMBY's own lead heading. Deliberately small
   and quiet: it is a fallback for "I booked this thirty seconds ago", not the
   main path — the match happens on its own. */
.res-hcontrols { display: inline-flex; align-items: center; gap: 7px;
  margin: 0 0 0 10px; vertical-align: middle;
  font-family: 'RES Rubik','Segoe UI',system-ui,Arial,sans-serif; direction: rtl; }
.res-hbtn { display: inline-flex; align-items: center; gap: 5px;
  padding: 5px 12px 5px 10px; border: 1.5px solid #e7e5e4; border-radius: 999px;
  background: #fff; color: #57534e; cursor: pointer;
  font-family: inherit; font-size: 12.5px; font-weight: 800; line-height: 1;
  transition: border-color .12s, color .12s, background .12s; }
.res-hbtn:hover { border-color: #fcd34d; background: #fffbeb; color: #b45309; }
.res-hbtn-icon { display: inline-block; font-size: 13px; }
.res-hbtn-busy { color: #b45309; border-color: #fcd34d; }
.res-hbtn-busy .res-hbtn-icon { animation: res-spin .9s linear infinite; }

.res-hstatus { display: inline-block; padding: 4px 10px; border-radius: 999px;
  font-family: 'RES Rubik','Segoe UI',system-ui,Arial,sans-serif;
  font-size: 12px; font-weight: 800; background: #f5f5f4; color: #78716c;
  vertical-align: middle; }
.res-hstatus-warn { background: #fffbeb; color: #b45309; }
.res-hstatus-bad { background: #fef2f2; color: #b91c1c; }

.res-hupdate { padding: 4px 11px; border: 0; border-radius: 999px;
  background: #fef3c7; color: #92400e; cursor: pointer;
  font-family: inherit; font-size: 12px; font-weight: 800; line-height: 1.4;
  transition: background .12s; }
.res-hupdate:hover { background: #fde68a; }

/* The two-step how-to, revealed by clicking the notice. Absolutely positioned
   so it hangs beneath the pill without disturbing BMBY's heading row. */
.res-hupdate-note { position: absolute; z-index: 2147483000; margin-top: 6px;
  display: flex; flex-direction: column; gap: 7px; width: 300px; box-sizing: border-box;
  padding: 12px 14px; background: #fff; border: 1.5px solid #fde68a;
  border-radius: 12px; box-shadow: 0 10px 26px rgba(146,64,14,.16);
  font-family: 'RES Rubik','Segoe UI',system-ui,Arial,sans-serif;
  direction: rtl; text-align: right; }
.res-hupdate-step { display: flex; align-items: flex-start; gap: 8px;
  font-size: 12.5px; font-weight: 700; line-height: 1.5; color: #44403c; }
.res-hupdate-num { flex: 0 0 auto; width: 18px; height: 18px; border-radius: 999px;
  background: #b45309; color: #fff; font-size: 11px; font-weight: 800;
  display: flex; align-items: center; justify-content: center; margin-top: 1px; }
.res-hupdate-dl { margin-top: 2px; font-size: 11.5px; font-weight: 700;
  color: #a8a29e; text-decoration: underline; }
.res-hupdate-dl:hover { color: #78716c; }

.res-banner { position: fixed; top: 0; left: 0; right: 0; z-index: 2147483647;
  color: #fff; direction: rtl; text-align: center;
  font-family: 'RES Rubik','Segoe UI',system-ui,Arial,sans-serif;
  font-size: 13px; font-weight: 800; letter-spacing: .01em; padding: 9px 12px; }

.res-hbtn:focus-visible, .res-hupdate:focus-visible {
  outline: 2px solid #f59e0b; outline-offset: 2px; }

@media (prefers-reduced-motion: reduce) {
  .res-inline-btn, .res-hbtn, .res-hupdate { transition: none; }
  .res-hbtn-busy .res-hbtn-icon { animation: none; }
}
`
    document.documentElement.appendChild(style)
  }

  /** The brand mark — three bars climbing, the tall one gold. `uid` keeps the
   *  gradient id unique when the mark is drawn more than once on a page. */
  function logoSvg(uid, size = 18) {
    const id = `res-g-${uid}`
    return (
      `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">` +
      `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0" stop-color="#fbbf24"/><stop offset="1" stop-color="#b45309"/>` +
      `</linearGradient></defs>` +
      `<rect x="3.2" y="12.5" width="4.4" height="8.3" rx="1.6" fill="#d6d3d1"/>` +
      `<rect x="9.8" y="8" width="4.4" height="12.8" rx="1.6" fill="#a8a29e"/>` +
      `<rect x="16.4" y="3.2" width="4.4" height="17.6" rx="1.6" fill="url(#${id})"/>` +
      `</svg>`
    )
  }

  // ── Small DOM helpers ──────────────────────────────────────────────────────
  function elc(tag, cls, text) {
    const n = document.createElement(tag)
    if (cls) n.className = cls
    if (text != null) n.textContent = text
    return n
  }

  /** A strip across the top of the form, for a result the agent must notice. */
  function banner(text, tone) {
    installStyles()
    const bar = elc('div', 'res-banner', text)
    bar.style.background = tone === 'bad' ? '#b91c1c' : '#15803d'
    document.body.appendChild(bar)
    setTimeout(() => bar.remove(), 6000)
  }

  // ── Which BMBY page are we standing on ─────────────────────────────────────
  //
  // The extension used to be pinned to two exact URLs in the manifest, so it
  // appeared only when a lead was reached by the one route we happened to have
  // written down. Open the same lead from the SALEPHONE dialler — or from any
  // other corner of BMBY — and the page looked completely ordinary: no meeting
  // card, no voice button, nothing, with no hint that anything was missing.
  //
  // The manifest now lets it load anywhere on www.bmby.com, and the decision of
  // whether to draw is made HERE, from the page itself. A URL we have never
  // seen is fine as long as it is really a lead; a URL we do know is still
  // ignored if the lead markup is not there.

  /** The lead's id, whatever BMBY happened to call the parameter this time. */
  const clientIdFromUrl = () => {
    const q = new URLSearchParams(location.search)
    for (const [key, value] of q.entries()) {
      // Case-insensitive, because "ClientID" and "clientid" are the same lead
      // and URLSearchParams.get is not.
      if (/^(client_?id|cid)$/i.test(key) && value) return value
    }
    return ''
  }

  const isForm = /\/CRMTasks\/TaskEdit\.php/i.test(location.pathname)

  /**
   * Visible enough to put a button in.
   *
   * Judged from computed style, walking up — NOT from getClientRects() or
   * offsetParent. Both are layout properties, and jsdom has no layout, so a
   * rect-based check reports every element in the test suite as invisible while
   * passing in Chrome. Display and visibility are computed in both.
   */
  function shown(el) {
    if (!el || !window.getComputedStyle) return !!el
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const st = window.getComputedStyle(n)
      if (!st) break
      if (st.display === 'none' || st.visibility === 'hidden') return false
    }
    return true
  }

  /**
   * BMBY's own heading for the lead — the element everything attaches to.
   *
   * A ladder, because the same heading is printed differently depending on the
   * screen, and losing one rung should cost the placement rather than the
   * feature. Every match is checked, not just the first: BMBY renders more than
   * one of these on some screens and hides the ones it is not using, and a
   * button inside a hidden one exists in the DOM and is never seen.
   */
  function leadHeading() {
    for (const sel of [
      '.wrappTitleInnerSection .personTitle',
      '.wrappTitleInnerSection',
      '.personTitle',
      '.clientNameInfo',
    ]) {
      for (const el of document.querySelectorAll(sel)) {
        if (shown(el)) return el
      }
    }
    return null
  }

  /**
   * תיק מתעניין, and nothing else in the lead's file.
   *
   * Every tab down the right-hand side is its own page — רשימת הקורסים is
   * clients/Product/College/coursesList.php, שיחות and לוג are others again —
   * and every one of them carries the same ClientID and the same BMBY heading
   * markup. So a rule written from the page's CONTENT matched all of them, and
   * the controls turned up on the course list, the call list and the rest.
   * The file name is the only thing that separates them.
   */
  const LEAD_PAGE = /\/(ClientFace|Client)\.php$/i
  const isLeadUrl = () => LEAD_PAGE.test(location.pathname)

  /**
   * A lead page: the right address AND the lead actually rendered on it.
   *
   * Both halves earn their place. Without the address, every tab qualifies.
   * Without the heading, the dialler's popup qualifies — it is a shell,
   * `<div id="ifrane_container"><iframe>` and nothing else, sitting at
   * .../Popup/clients/Client.php while the real lead lives in the frame inside
   * it. Address alone would draw on the empty wrapper; content alone would draw
   * on the course list.
   *
   * Late rendering is covered by boot.js, which waits for this to become true
   * rather than asking once.
   */
  const isLead = () => !isForm && isLeadUrl() && !!leadHeading()

  return {
    API,
    HANDOFF_TTL_MS,
    BMBY_USER,
    FIELD,
    TASK,
    PRIORITY,
    clientName,
    cleanDescription,
    meetingSubject,
    pad,
    bmbyDate,
    isoDate,
    dayMonth,
    snapMinute,
    byName,
    setText,
    setSelect,
    setHidden,
    flash,
    installStyles,
    logoSvg,
    elc,
    meetingPhone,
    pagePhones,
    matchMeeting,
    pageAnchor,
    banner,
    clientIdFromUrl,
    isForm,
    isLead,
    leadHeading,
  }
})()
