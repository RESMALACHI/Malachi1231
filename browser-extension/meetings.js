// The meeting for the lead whose page this is — found by phone, offered in
// place, and nothing else.
//
// This used to be a floating panel listing every meeting the agent had, with
// the matched one highlighted at the top. The list turned out to be scaffolding:
// once matching by phone worked, nobody scrolled it. So the list is gone, and
// what is left is the one meeting that belongs to this lead, sitting in BMBY's
// own layout, plus a refresh beside the lead's name for when a booking was made
// seconds ago.
//
// It fills and stops. It never presses אישור, and it never reads anything out
// of BMBY except the phone numbers already printed on the page — which are
// compared in the browser and never sent anywhere.

RES.meetings = (() => {
  // While BMBY is open in front of the agent the calendar is pulled on this
  // cadence, so a meeting booked on the phone turns up without anyone asking.
  // The server debounces the actual fetch, so open tabs share one pull.
  const REFRESH_MS = 10_000

  const { elc, pad, clientName, setText, setSelect, snapMinute, FIELD } = RES

  /**
   * `sync` asks the server to pull the calendar before answering:
   *   'now'  — the agent pressed refresh, having just booked something
   *   'open' — the page just loaded; freshen quietly in the background
   *   'auto' — the ten-second poll
   *   null   — read what is already stored
   */
  async function loadMeetings(cfg, sync) {
    const res = await fetch(RES.API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-bridge-token': cfg.token },
      body: JSON.stringify({ agentName: cfg.agentName, limit: 60, sync: sync || undefined }),
    })
    const data = await res.json()
    if (!data.ok) throw new Error(data.error || 'failed')
    return data
  }

  function fill(meeting, agentName) {
    const d = new Date(meeting.meeting_date)
    const end = new Date(d.getTime() + 3600000)

    const filled = []
    if (setSelect(FIELD.type, RES.TASK.meeting)) filled.push('סוג')
    // Both halves of BMBY's date: the visible field the agent sees, AND the
    // hidden companion that submit actually reads. Setting only the visible one
    // showed the right date but saved today's.
    if (setText(FIELD.date, RES.bmbyDate(d))) filled.push('תאריך')
    RES.setHidden(FIELD.dateHidden, RES.isoDate(d))
    if (setSelect(FIELD.hourStart, String(d.getHours()))) filled.push('שעה')
    setSelect(FIELD.minuteStart, snapMinute(d.getMinutes()))
    setSelect(FIELD.hourEnd, String(end.getHours()))
    setSelect(FIELD.minuteEnd, snapMinute(end.getMinutes()))

    if (setText(FIELD.subject, RES.meetingSubject(meeting))) filled.push('נושא')

    // Location is deliberately left alone — BMBY fills it from its own data.

    const note = RES.cleanDescription(meeting.description)
    if (note && setText(FIELD.message, note.slice(0, 2000))) filled.push('תיאור')

    const userId = RES.BMBY_USER[agentName]
    if (userId && setSelect(FIELD.owner, userId)) filled.push('נציג')

    setSelect(FIELD.priority, RES.PRIORITY.sales) // "פגישת מכירה"

    return filled
  }

  /** A meeting picked on the lead page: fill this form and say so. */
  async function handoff(cfg) {
    const { pending } = await chrome.storage.local.get('pending')
    if (!pending || Date.now() - pending.at >= RES.HANDOFF_TTL_MS) return false
    await chrome.storage.local.remove('pending')
    const filled = fill(pending.meeting, cfg.agentName)
    RES.banner(
      filled.length
        ? `מולא מהמערכת: ${filled.join(' · ')} — בדקו ולחצו אישור`
        : 'לא נמצאו שדות למילוי — ייתכן שהטופס השתנה',
      filled.length ? 'ok' : 'bad'
    )
    return true
  }

  // ── The lead's header, where the refresh control goes ───────────────────────
  //
  // BMBY prints the lead's name twice: once in the left sidebar (.clientNameInfo)
  // and once as the page's own heading, inside .wrappTitleInnerSection between a
  // person icon and an edit pencil. The heading is the one worth attaching to;
  // the class is checked first and a font-size search is the fallback, so a
  // markup change costs the nice placement rather than the feature.
  //
  // The dialler's popup (mbeat.bmby.com/MBeat/POld/Popup/clients/) prints the
  // same heading — person icon, name, edit pencil — but not inside
  // `.wrappTitleInnerSection`, so only the outer wrapper is missing. Hence a
  // ladder rather than one selector: each rung is a place BMBY is known to put
  // the lead's name, most specific first, and losing one costs the nice
  // placement rather than the control.
  // One definition, in shared.js — the same element decides both "is this a
  // lead page at all" and "where do the controls go", and two copies of that
  // judgement would eventually disagree.
  const headerName = () => RES.leadHeading()

  function attach({ cfg }) {
    let dead = false
    let inline = null
    let repositioner = null
    let controls = null
    let statusEl = null
    let spinning = false

    function clearInline() {
      if (repositioner) window.removeEventListener('resize', repositioner)
      repositioner = null
      inline = null
      // Swept by class rather than by the tracked reference: a card left behind
      // by a previous run belongs to nobody, and this is what removes it.
      document.querySelectorAll('.res-inline-tr, .res-inline').forEach((n) => n.remove())
    }

    /** Act on a meeting: on the form fill it, on the lead page open the form. */
    function use(m) {
      if (RES.isForm) {
        const filled = fill(m, cfg.agentName)
        RES.banner(
          filled.length
            ? `מולא: ${filled.join(' · ')} — בדקו ולחצו אישור`
            : 'לא נמצאו שדות למילוי — ייתכן שהטופס השתנה',
          filled.length ? 'ok' : 'bad'
        )
      } else {
        const id = RES.clientIdFromUrl()
        chrome.storage.local.set({ pending: { meeting: m, at: Date.now() } }).then(() => {
          window.open(
            `https://www.bmby.com/CRMTasks/TaskEdit.php?ClientID=${encodeURIComponent(id)}` +
              `&actions=addToClient&TaskType=Appointment`,
            '_blank',
            'width=820,height=760'
          )
        })
      }
    }

    // ── The card ─────────────────────────────────────────────────────────────
    function buildCard(hit, name) {
      const d = new Date(hit.meeting.meeting_date)
      const isZoom = hit.meeting.type === 'zoom'

      const card = elc('div', 'res-inline')

      const badge = elc('div', 'res-inline-badge')
      badge.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" ' +
        'stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'
      card.appendChild(badge)

      const text = elc('div', 'res-inline-text')
      text.appendChild(
        elc(
          'div',
          'res-inline-eyebrow',
          hit.also > 0 ? `פגישה במערכת · עוד ${hit.also}` : 'פגישה במערכת'
        )
      )
      text.appendChild(elc('div', 'res-inline-name', name))
      const meta = elc('div', 'res-inline-meta')
      meta.appendChild(
        elc('span', null, `${RES.dayMonth(d)} · ${pad(d.getHours())}:${pad(d.getMinutes())}`)
      )
      meta.appendChild(
        elc(
          'span',
          `res-chip ${isZoom ? 'res-chip-zoom' : 'res-chip-frontal'}`,
          isZoom ? 'זום' : 'פרונטלי'
        )
      )
      text.appendChild(meta)
      card.appendChild(text)

      const btn = elc('button', 'res-inline-btn', RES.isForm ? 'מלא טופס' : 'פתח פגישה')
      btn.type = 'button'
      btn.onclick = () => use(hit.meeting)
      card.appendChild(btn)

      return card
    }

    const GAP = 20
    const WIDTH = 346

    /**
     * Preferred placement is IN the page, not over it: the lead card is a table,
     * so the card takes a row of its own under the phone and the page makes
     * room. Anything else falls back to floating beside the anchor.
     */
    function place(hit, name) {
      const anchor = RES.pageAnchor(hit.phone, name) || headerName()
      if (!anchor) return false

      const card = buildCard(hit, name)

      const row = anchor.closest && anchor.closest('tr')
      if (row && row.parentElement) {
        const tr = document.createElement('tr')
        tr.className = 'res-inline-tr'
        const td = document.createElement('td')
        td.colSpan = Math.max(row.cells ? row.cells.length : 1, 1)
        card.classList.add('res-inline--flow')
        td.appendChild(card)
        tr.appendChild(td)
        row.insertAdjacentElement('afterend', tr)
        inline = tr
        return true
      }

      document.body.appendChild(card)
      inline = card

      const position = () => {
        const r = anchor.getBoundingClientRect()
        const base = document.body.getBoundingClientRect()
        let top = r.top - base.top + r.height / 2 - card.offsetHeight / 2
        let left = r.left - base.left - WIDTH - GAP
        if (left < 8) {
          left = Math.max(8, r.right - base.left - WIDTH)
          top = r.bottom - base.top + 8
        }
        card.style.top = `${Math.max(4, top)}px`
        card.style.left = `${Math.max(8, left)}px`
      }
      position()
      setTimeout(position, 400)
      repositioner = position
      window.addEventListener('resize', position)
      return true
    }

    // ── The control beside the lead's name ───────────────────────────────────
    function say(text, tone) {
      if (!statusEl) return
      statusEl.textContent = text || ''
      statusEl.className = `res-hstatus${tone ? ` res-hstatus-${tone}` : ''}`
      statusEl.style.display = text ? '' : 'none'
    }

    function mountControls() {
      // Guaranteed by the gate in boot.js — this frame is a lead page precisely
      // BECAUSE this element exists. Kept as a guard, not as a branch: drawing
      // the controls somewhere else on a page that turned out not to have a
      // heading is what put them in a strip above the dialler's empty wrapper.
      const name = headerName()
      if (!name) return
      controls = elc('span', 'res-hcontrols')

      const btn = elc('button', 'res-hbtn')
      btn.type = 'button'
      btn.title = 'חיפוש פגישה מהמערכת'
      btn.setAttribute('aria-label', 'חיפוש פגישה מהמערכת')
      btn.innerHTML = '<span class="res-hbtn-icon">⟳</span><span>חפש פגישה</span>'
      btn.onclick = async () => {
        if (spinning) return
        spinning = true
        btn.classList.add('res-hbtn-busy')
        say('מחפש…', null)
        try {
          await refresh({ sync: 'now' })
        } finally {
          spinning = false
          btn.classList.remove('res-hbtn-busy')
        }
      }
      controls.appendChild(btn)

      statusEl = elc('span', 'res-hstatus')
      statusEl.style.display = 'none'
      controls.appendChild(statusEl)

      // Before the name, which in an RTL heading renders to its right — where
      // the eye lands first, next to BMBY's own person icon.
      name.insertAdjacentElement('beforebegin', controls)
    }

    // ── Finding and showing ──────────────────────────────────────────────────
    async function refresh({ sync = null, quiet = false } = {}) {
      if (dead) return
      try {
        const data = await loadMeetings(cfg, sync)
        if (dead) return
        const meetings = data.meetings || []
        const hit = RES.matchMeeting(meetings)

        clearInline()
        if (!hit) {
          if (!quiet) say('לא נמצאה פגישה לליד הזה', 'warn')
          return
        }
        const name = clientName(hit.meeting.title, hit.meeting.agent_name)
        place(hit, name)
        say('', null)
      } catch (err) {
        if (dead) return
        if (!quiet) {
          say(
            String(err.message) === 'unauthorized'
              ? 'קוד גישה שגוי — בדקו באפשרויות'
              : 'אין חיבור לשרת',
            'bad'
          )
        }
      }
    }

    mountControls()
    // Show whatever is stored at once, then pull the calendar behind it.
    refresh({ quiet: true }).then(() => refresh({ sync: 'open', quiet: true }))

    let inFlight = false
    const tick = async () => {
      if (dead || document.hidden || inFlight) return
      inFlight = true
      try {
        await refresh({ sync: 'auto', quiet: true })
      } finally {
        inFlight = false
      }
    }
    const timer = setInterval(tick, REFRESH_MS)
    const onVisible = () => {
      if (!document.hidden) tick()
    }
    document.addEventListener('visibilitychange', onVisible)

    return {
      refresh: () => refresh({ sync: 'now' }),
      destroy: () => {
        dead = true
        clearInterval(timer)
        document.removeEventListener('visibilitychange', onVisible)
        clearInline()
        controls?.remove()
      },
    }
  }

  return { handoff, attach, headerName }
})()
