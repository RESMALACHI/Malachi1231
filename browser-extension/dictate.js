// Dictation for the task description.
//
// A small toolbar under BMBY's "תיאור" box: press the mic, talk, and the words
// land in the field as you say them. Typing a meeting summary in Hebrew with
// one hand on the phone is the slowest part of logging a call, and it is the
// part agents skip — so the note that survives is "דיברנו" instead of what was
// actually said.
//
// Uses Chrome's built-in speech engine (webkitSpeechRecognition). No API key,
// no quota, no server call of ours, and it streams interim words so the agent
// sees the sentence forming instead of waiting for a round trip.
//
// SCOPE: this only ever WRITES into the description field the agent is already
// typing in — the same thing the extension does when it fills a meeting. It
// reads nothing out of BMBY and never touches אישור.
//
// NOTE ON PRIVACY: Chrome's engine sends the audio to Google's speech service.
// That is how the browser API works; there is no local mode.

RES.dictate = (() => {
  const { FIELD, elc } = RES

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition

  // ודיע's leads are Arabic-speaking, so the language has to be switchable
  // without leaving the form.
  const LANGS = [
    { code: 'he-IL', label: 'עברית' },
    { code: 'ar-SA', label: 'ערבית' },
  ]

  // Why a start failed, in words an agent can act on. Chrome's own error names
  // ("not-allowed") tell you nothing about what to do next.
  const REASON = {
    'not-allowed': 'אין הרשאת מיקרופון — לחצו על 🔒 בשורת הכתובת ואפשרו מיקרופון',
    'service-not-allowed': 'הדפדפן חסם את שירות הדיבור',
    'audio-capture': 'לא נמצא מיקרופון מחובר',
    network: 'אין חיבור לאינטרנט',
  }

  let rec = null
  let live = false
  let langIdx = 0
  // Where the dictated text is being written, captured when recording starts so
  // it lands at the cursor instead of wiping whatever is already typed.
  let box = null
  let before = ''
  let after = ''

  let btn = null
  let langBtn = null
  let status = null

  function ensureStyle() {
    if (document.getElementById('res-dictate-style')) return
    const s = document.createElement('style')
    s.id = 'res-dictate-style'
    s.textContent = `
.res-dic {
  display: flex; align-items: center; gap: 8px;
  margin: 6px 0 2px; direction: rtl;
  font-family: 'RES Rubik', Rubik, Arial, sans-serif;
}
.res-dic-btn {
  display: inline-flex; align-items: center; gap: 6px;
  border: 1px solid #cbd5e1; background: #fff; color: #0f172a;
  border-radius: 999px; padding: 5px 12px; cursor: pointer;
  font-size: 12.5px; font-weight: 700; line-height: 1.4;
  transition: background .15s, border-color .15s, color .15s;
}
.res-dic-btn:hover { background: #f1f5f9; }
.res-dic-btn.on {
  background: #b91c1c; border-color: #b91c1c; color: #fff;
  animation: res-dic-pulse 1.3s ease-in-out infinite;
}
@keyframes res-dic-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(185, 28, 28, .45); }
  50%      { box-shadow: 0 0 0 6px rgba(185, 28, 28, 0); }
}
.res-dic-dot {
  width: 8px; height: 8px; border-radius: 50%; background: #64748b; flex: none;
}
.res-dic-btn.on .res-dic-dot { background: #fff; }
.res-dic-lang {
  border: 1px solid #e2e8f0; background: #f8fafc; color: #334155;
  border-radius: 8px; padding: 4px 9px; cursor: pointer;
  font-size: 11.5px; font-weight: 700; font-family: inherit;
}
.res-dic-lang:hover { background: #eef2f6; }
.res-dic-status { font-size: 11.5px; color: #64748b; font-weight: 600; }
.res-dic-status.bad { color: #b91c1c; }
`
    document.head.appendChild(s)
  }

  function say(text, bad) {
    if (!status) return
    status.textContent = text || ''
    status.className = 'res-dic-status' + (bad ? ' bad' : '')
  }

  /** Paint the current transcript into the field, at the captured cursor. */
  function render(text) {
    const mid = text ? text.replace(/\s+/g, ' ').trimStart() : ''
    // Dictating in FRONT of existing text would otherwise weld the last spoken
    // word onto the first written one ("אמצעסוף"). Only once there is something
    // to separate — an empty transcript must not shift the text that is there.
    const tail = mid && after && !/^\s/.test(after) ? ' ' + after : after
    box.value = before + mid + tail
    const pos = (before + mid).length
    try {
      box.setSelectionRange(pos, pos)
    } catch {
      /* the field may not support selection while unfocused — harmless */
    }
    // BMBY's form listens for these; a silently assigned .value would leave the
    // page believing the description is still empty.
    box.dispatchEvent(new Event('input', { bubbles: true }))
  }

  function stop(message) {
    live = false
    if (rec) {
      try {
        rec.stop()
      } catch {
        /* already stopped */
      }
    }
    rec = null
    if (btn) btn.classList.remove('on')
    if (box) box.dispatchEvent(new Event('change', { bubbles: true }))
    say(message || '')
  }

  async function start() {
    if (!SR) {
      say('הדפדפן הזה לא תומך בהכתבה — צריך Chrome', true)
      return
    }

    // Ask for the microphone FIRST. Starting recognition cold on a page that has
    // never been granted the mic fails with a bare "not-allowed" and no prompt;
    // getUserMedia is what actually raises Chrome's permission bar. The stream
    // is released immediately — the speech engine opens its own.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((t) => t.stop())
    } catch (err) {
      const name = err && err.name
      say(
        name === 'NotFoundError'
          ? 'לא נמצא מיקרופון מחובר'
          : name === 'NotAllowedError'
            ? REASON['not-allowed']
            : 'לא הצלחתי לפתוח את המיקרופון',
        true
      )
      return
    }

    // Capture the insertion point now, so dictation never overwrites text the
    // agent already typed — it opens up at the cursor and pushes the rest right.
    const at = typeof box.selectionStart === 'number' ? box.selectionStart : box.value.length
    before = box.value.slice(0, at)
    after = box.value.slice(at)
    if (before && !/\s$/.test(before)) before += ' '

    rec = new SR()
    rec.lang = LANGS[langIdx].code
    rec.continuous = true
    rec.interimResults = true

    rec.onresult = (e) => {
      let text = ''
      // results is cumulative for the session, so rebuilding the whole string
      // each time is both simplest and always consistent with what was heard.
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript
      render(text)
    }

    rec.onerror = (e) => {
      // Silence is not a failure — Chrome fires no-speech on any quiet moment.
      if (e.error === 'no-speech' || e.error === 'aborted') return
      stop(REASON[e.error] || 'ההכתבה נעצרה')
    }

    // Chrome ends a session on its own after a pause, even with continuous set.
    // Restarting keeps a long dictation going instead of dying mid-sentence.
    rec.onend = () => {
      if (!live) return
      try {
        rec.start()
      } catch {
        stop()
      }
    }

    live = true
    btn.classList.add('on')
    say('מקליט — דברו, לחצו שוב לעצירה')
    try {
      rec.start()
    } catch {
      stop('לא הצלחתי להתחיל')
    }
  }

  function toggle() {
    if (live) stop('')
    else start()
  }

  function build() {
    const bar = elc('div', 'res-dic')
    bar.id = 'res-dictate'

    btn = elc('button', 'res-dic-btn')
    btn.type = 'button' // never submit BMBY's form
    btn.appendChild(elc('span', 'res-dic-dot'))
    btn.appendChild(elc('span', null, 'הכתבה'))
    btn.onclick = (e) => {
      e.preventDefault()
      toggle()
    }

    langBtn = elc('button', 'res-dic-lang', LANGS[langIdx].label)
    langBtn.type = 'button'
    langBtn.title = 'שפת ההכתבה'
    langBtn.onclick = (e) => {
      e.preventDefault()
      langIdx = (langIdx + 1) % LANGS.length
      langBtn.textContent = LANGS[langIdx].label
      if (live) {
        stop('')
        start()
      }
    }

    status = elc('span', 'res-dic-status')

    bar.appendChild(btn)
    bar.appendChild(langBtn)
    bar.appendChild(status)
    return bar
  }

  function mount() {
    if (document.getElementById('res-dictate')) return true
    const field = document.querySelector(`[name="${FIELD.message}"]`)
    if (!field) return false

    box = field
    ensureStyle()
    field.insertAdjacentElement('afterend', build())

    // Esc is the reflex for "stop that" — and it must not bubble into BMBY's
    // own key handling, which would close or reset the form.
    field.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && live) {
        e.stopPropagation()
        stop('')
      }
    })
    return true
  }

  function attach() {
    if (!SR) return // no engine in this browser — don't draw a dead button
    if (mount()) return
    // The form can render late; watch until the field appears, then stop.
    const obs = new MutationObserver(() => {
      if (mount()) obs.disconnect()
    })
    obs.observe(document.documentElement, { childList: true, subtree: true })
    setTimeout(() => obs.disconnect(), 15_000)
  }

  return { attach }
})()
