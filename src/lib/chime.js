// The board's sounds: a short synthesised chime for each win, and two songs —
// one for a meeting milestone, one for a closed deal. Nothing plays until the
// viewer presses "הפעל צלילים": browsers block audio until a gesture, and that
// button is the gesture.

import milestoneUrl from '../assets/milestone.mp3'
import dealUrl from '../assets/deal.mp3'

let ctx = null

const FADE_MS = 900

/**
 * One song, and everything that has to be true for it to play on a wall board.
 *
 * The priming is the part that matters and the part that is easy to get wrong:
 * an element that has never been played during a user interaction cannot be
 * started later from a timer, and a milestone or a closed deal is always a
 * timer. Playing it silently and pausing it inside the gesture is what marks it
 * as allowed for the rest of the session.
 */
function makeTrack(url, volume) {
  let el = null
  let stopTimer = null
  let fadeTimer = null

  const clearTimers = () => {
    if (stopTimer) clearTimeout(stopTimer)
    if (fadeTimer) clearInterval(fadeTimer)
    stopTimer = null
    fadeTimer = null
  }

  const stop = () => {
    clearTimers()
    if (!el) return
    try {
      el.pause()
      el.currentTime = 0
      el.volume = volume
    } catch {
      /* nothing worth reporting */
    }
  }

  return {
    stop,

    prime() {
      if (el) return
      try {
        el = new Audio(url)
        el.preload = 'auto'
        el.volume = 0
        el
          .play()
          .then(() => {
            el.pause()
            el.currentTime = 0
          })
          .catch(() => {
            /* blocked — play() will simply do nothing */
          })
      } catch {
        el = null
      }
    },

    /**
     * @param limitMs cut the song short at this point, fading out. Omit to let
     *                it play to its own end — which is what a closed deal gets.
     */
    play(limitMs) {
      if (!el || !audioReady()) return
      clearTimers()
      try {
        el.currentTime = 0
        el.volume = volume
        el.play().catch(() => {})
      } catch {
        return
      }
      if (!limitMs) return

      // Ending on a fade rather than a cut: an abrupt stop on a wall board
      // reads as a glitch, not as an ending.
      stopTimer = setTimeout(() => {
        const steps = 18
        const from = el.volume
        let i = 0
        fadeTimer = setInterval(() => {
          i += 1
          try {
            // iOS makes volume read-only; the pause below still ends it cleanly.
            el.volume = Math.max(0, from * (1 - i / steps))
          } catch {
            /* ignore */
          }
          if (i >= steps) stop()
        }, FADE_MS / steps)
      }, Math.max(0, limitMs - FADE_MS))
    },
  }
}

/** The milestone song is cut to the banner's length; see MILESTONE_MS. */
const milestone = makeTrack(milestoneUrl, 0.55)
/**
 * The deal song plays to its own end, at full volume.
 *
 * 1 is the ceiling: an <audio> element cannot be pushed past its source, so
 * anything louder than this is the TV set's own volume knob, not ours.
 */
const deal = makeTrack(dealUrl, 1)

/** Called from the sound-toggle click. Creates/*resumes* the context. */
export function initAudio() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return false
      ctx = new AC()
    }
    if (ctx.state === 'suspended') ctx.resume()
    milestone.prime()
    deal.prime()
    return true
  } catch {
    return false
  }
}

export function audioReady() {
  return !!ctx && ctx.state === 'running'
}

/** Silence whatever is playing. Two songs at once is noise, not a celebration. */
export function stopAllMusic() {
  milestone.stop()
  deal.stop()
}

/** The milestone song: cut to `limitMs` so it ends with the banner. */
export function playMilestoneMusic(limitMs) {
  stopAllMusic()
  milestone.play(limitMs)
}

/**
 * The deal song, in full.
 *
 * No limit: a closed deal is the one thing here that gets the whole track. The
 * takeover on screen is sized to match it, so the picture and the sound end
 * together.
 */
export function playDealMusic() {
  stopAllMusic()
  deal.play()
}

/**
 * A rising arpeggio. A meeting gets a two-note lift; a deal gets the full
 * four-note fanfare — the bigger the win, the bigger the sound.
 */
export function playChime(kind = 'meeting') {
  if (!audioReady()) return
  const now = ctx.currentTime
  const notes =
    kind === 'deal'
      ? [523.25, 659.25, 783.99, 1046.5] // C5 E5 G5 C6
      : [587.33, 880.0] // D5 A5

  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    osc.connect(gain)
    gain.connect(ctx.destination)

    const t0 = now + i * 0.11
    gain.gain.setValueAtTime(0, t0)
    gain.gain.linearRampToValueAtTime(kind === 'deal' ? 0.2 : 0.16, t0 + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.55)
    osc.start(t0)
    osc.stop(t0 + 0.6)
  })
}
