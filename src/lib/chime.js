// The board's two sounds: a short synthesised chime for each win, and the
// milestone song. Nothing plays until the viewer presses "הפעל צלילים" —
// browsers block audio until a gesture, and that button is the gesture.

import milestoneUrl from '../assets/milestone.mp3'

let ctx = null

/** The milestone song plays for this long, ending in a fade. */
const MUSIC_MS = 8000
const FADE_MS = 900
const MUSIC_VOLUME = 0.55

let music = null
let stopTimer = null
let fadeTimer = null

/**
 * Prepare the song. MUST be called from inside the gesture: an element that has
 * never been played during a user interaction cannot be started later from a
 * timer, which is exactly what a milestone is. Playing and immediately pausing
 * it here is what marks it as allowed.
 */
function primeMusic() {
  if (music) return
  try {
    music = new Audio(milestoneUrl)
    music.preload = 'auto'
    music.volume = 0
    music
      .play()
      .then(() => {
        music.pause()
        music.currentTime = 0
      })
      .catch(() => {
        /* blocked — playMilestoneMusic will simply do nothing */
      })
  } catch {
    music = null
  }
}

/** Called from the sound-toggle click. Creates/*resumes* the context. */
export function initAudio() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return false
      ctx = new AC()
    }
    if (ctx.state === 'suspended') ctx.resume()
    primeMusic()
    return true
  } catch {
    return false
  }
}

function clearTimers() {
  if (stopTimer) clearTimeout(stopTimer)
  if (fadeTimer) clearInterval(fadeTimer)
  stopTimer = null
  fadeTimer = null
}

/** Cut the song short — used when the viewer switches sound off mid-song. */
export function stopMilestoneMusic() {
  clearTimers()
  if (!music) return
  try {
    music.pause()
    music.currentTime = 0
    music.volume = MUSIC_VOLUME
  } catch {
    /* nothing worth reporting */
  }
}

/**
 * The milestone song: eight seconds, ending in a fade rather than a cut — an
 * abrupt stop on a wall board reads as a glitch, not as an ending.
 */
export function playMilestoneMusic() {
  if (!music || !audioReady()) return
  clearTimers()
  try {
    music.currentTime = 0
    music.volume = MUSIC_VOLUME
    music.play().catch(() => {})
  } catch {
    return
  }

  stopTimer = setTimeout(() => {
    const steps = 18
    const from = music.volume
    let i = 0
    fadeTimer = setInterval(() => {
      i += 1
      try {
        // iOS makes volume read-only; the pause below still ends it cleanly.
        music.volume = Math.max(0, from * (1 - i / steps))
      } catch {
        /* ignore */
      }
      if (i >= steps) stopMilestoneMusic()
    }, FADE_MS / steps)
  }, MUSIC_MS - FADE_MS)
}

export function audioReady() {
  return !!ctx && ctx.state === 'running'
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
