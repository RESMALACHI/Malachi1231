// The voice of זירת אימון — entirely the browser's, so it costs nothing.
//
//   ears   Web Speech recognition (Chrome, Edge, Safari). Chrome sends the audio
//          to Google's recogniser, Edge to Microsoft's; neither bills us.
//   mouth  speechSynthesis with the best voice this device has. Edge carries
//          Microsoft's neural "Online (Natural)" voices for Hebrew and Arabic
//          for free — the difference between a person and a robot — so they win
//          whenever present, and the page says so when they are not.
//
// Anything missing degrades rather than breaks: no recogniser means typing, no
// voice means the prospect's words appear without being spoken.

const LOCALES = { he: 'he-IL', ar: 'ar-IL' }

const Recognition =
  typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null

export const canListen = () => !!Recognition
export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window

// ── Mouth ────────────────────────────────────────────────────────────────────

const NATURAL = /natural|online|neural|premium|enhanced/i
const FEMALE = /hila|carmit|sapir|zariyah|salma|hoda|amina|layla|mouna|fatima|female/i
const MALE = /avri|asaf|hamed|naayf|shakir|omar|hamdan|male/i

/**
 * The voice list arrives asynchronously in Chrome (empty on the first call,
 * filled after `voiceschanged`). Waits for it, but never for long — a device
 * with no voices at all must not hang the call.
 */
export function loadVoices() {
  if (!canSpeak()) return Promise.resolve([])
  const now = window.speechSynthesis.getVoices()
  if (now.length) return Promise.resolve(now)
  return new Promise((resolve) => {
    const done = () => resolve(window.speechSynthesis.getVoices())
    window.speechSynthesis.addEventListener('voiceschanged', done, { once: true })
    setTimeout(done, 1500)
  })
}

/** Best voice for this language and gender, or null. */
export function pickVoice(voices, lang, gender) {
  const prefixes = lang === 'ar' ? ['ar'] : ['he', 'iw']
  let best = null
  let bestScore = -Infinity
  for (const v of voices || []) {
    const code = String(v.lang || '').toLowerCase()
    if (!prefixes.some((p) => code.startsWith(p))) continue
    let s = 0
    if (NATURAL.test(v.name)) s += 4
    const f = FEMALE.test(v.name)
    const m = MALE.test(v.name) && !f
    if ((gender === 'f' && f) || (gender === 'm' && m)) s += 2
    else if (f || m) s -= 1
    if (lang === 'ar' && /IL|PS|JO|LB|SY/i.test(v.lang)) s += 1 // closest to Levantine
    if (s > bestScore) {
      best = v
      bestScore = s
    }
  }
  return best
}

export const isNatural = (voice) => !!voice && NATURAL.test(voice.name)

let speakingTimer = null

/**
 * Say one line. Resolves when it has been said — or when it plainly should
 * have: Chrome sometimes never fires `end`, so a timer sized to the text is the
 * backstop that keeps the call from waiting forever.
 */
export function speak(text, { voice, lang = 'he', rate = 1, pitch = 1 } = {}) {
  return new Promise((resolve) => {
    if (!canSpeak() || !text) return resolve()
    const synth = window.speechSynthesis
    synth.cancel()
    clearTimeout(speakingTimer)

    const u = new SpeechSynthesisUtterance(text)
    u.lang = voice?.lang || LOCALES[lang]
    if (voice) u.voice = voice
    u.rate = rate
    u.pitch = pitch

    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(speakingTimer)
      resolve()
    }
    u.onend = finish
    u.onerror = finish
    speakingTimer = setTimeout(finish, 1800 + text.length * 95)
    synth.speak(u)
  })
}

export function stopSpeaking() {
  clearTimeout(speakingTimer)
  if (canSpeak()) window.speechSynthesis.cancel()
}

// ── Ears ─────────────────────────────────────────────────────────────────────

/**
 * A tap-to-talk listener. `start()` opens the mic; `stop()` closes it and
 * resolves with everything said in between.
 *
 * Chrome ends a "continuous" session on its own after a pause or a network
 * hiccup. While the agent is still holding the floor that is not the end of
 * their turn, so the session is quietly reopened and the words kept.
 */
export function createListener({ lang = 'he', onInterim, onError } = {}) {
  if (!Recognition) return null

  let rec = null
  let wanted = false
  let finals = ''
  let interim = ''
  let resolveStop = null

  const text = () => `${finals} ${interim}`.replace(/\s+/g, ' ').trim()

  const open = () => {
    rec = new Recognition()
    rec.lang = LOCALES[lang] || LOCALES.he
    rec.continuous = true
    rec.interimResults = true
    rec.maxAlternatives = 1

    rec.onresult = (e) => {
      interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) finals += ` ${r[0].transcript}`
        else interim += ` ${r[0].transcript}`
      }
      onInterim?.(text())
    }
    rec.onerror = (e) => {
      // "no-speech" and "aborted" are part of normal use, not failures.
      if (e.error === 'no-speech' || e.error === 'aborted') return
      wanted = false
      onError?.(e.error)
    }
    rec.onend = () => {
      if (wanted) {
        // Fold what was pending into the kept text before reopening, or the
        // last half-sentence would vanish with the old session.
        finals = text()
        interim = ''
        try {
          open()
          return
        } catch {
          wanted = false
        }
      }
      const said = text()
      resolveStop?.(said)
      resolveStop = null
    }
    rec.start()
  }

  return {
    start() {
      finals = ''
      interim = ''
      wanted = true
      open()
    },
    /** Close the mic; resolves with the whole turn. */
    stop() {
      wanted = false
      return new Promise((resolve) => {
        resolveStop = resolve
        try {
          rec?.stop()
        } catch {
          resolve(text())
        }
        // Some engines never send the final `end` after stop().
        setTimeout(() => {
          if (resolveStop) {
            resolveStop(text())
            resolveStop = null
          }
        }, 1500)
      })
    },
    abort() {
      wanted = false
      resolveStop = null
      try {
        rec?.abort()
      } catch {
        /* already closed */
      }
    },
  }
}
