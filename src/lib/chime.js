// A short celebration chime, synthesised with the Web Audio API — no asset to
// load, and nothing plays until the viewer presses "הפעל צלילים" (browsers
// block audio until a gesture, and that button is the gesture).

let ctx = null

/** Called from the sound-toggle click. Creates/*resumes* the context. */
export function initAudio() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return false
      ctx = new AC()
    }
    if (ctx.state === 'suspended') ctx.resume()
    return true
  } catch {
    return false
  }
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
