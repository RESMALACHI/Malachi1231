// Shared formatting for the TV board's views.

import { clientName } from '../../lib/meetingTitle'

/** "הרגע" · "לפני 6 דק׳" · "לפני 3 שע׳" — how long ago, in the office's words. */
export function relativeHe(iso) {
  if (!iso) return ''
  const secs = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 45) return 'הרגע'
  const mins = Math.round(secs / 60)
  if (mins < 60) return `לפני ${mins} דק׳`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `לפני ${hrs} שע׳`
  return `לפני ${Math.round(hrs / 24)} ימים`
}

/** "14:30" from an ISO datetime, Israel-local. */
export function hhmm(iso) {
  if (!iso) return ''
  try {
    return new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit' }).format(
      new Date(iso)
    )
  } catch {
    return ''
  }
}

/** "₪12,400" */
export const shekels = (n) => `₪${Math.round(Number(n) || 0).toLocaleString('en-US')}`

// A bright, high-contrast hue per agent for the dark board. Stable per name.
const HUES = ['#fbbf24', '#38bdf8', '#f472b6', '#a78bfa', '#34d399', '#fb923c', '#60a5fa', '#f87171']
export function agentColor(name) {
  const s = String(name || '')
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return HUES[h % HUES.length]
}

export function initials(name) {
  const p = String(name || '?').trim().split(/\s+/)
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')) || '?'
}

/** The display name for a feed row / the hero. Meetings carry a messy title. */
export function displayName(item) {
  // Deals get the SAME cleaning as meetings, because a deal's stored name is
  // usually a calendar title: it is created from the meeting it closed, so the
  // board was printing "פגישת זום - רון וררגה - מלאכי אזערי - אישר" under the
  // words "עסקה נסגרה". Running an already-clean name through this changes
  // nothing, so the hand-typed ones are safe.
  const cleaned = clientName(item.who, item.agent)
  if (cleaned && cleaned !== '(ללא פרטים)') return cleaned
  const raw = String(item.who || '').trim()
  if (raw) return raw
  return item.kind === 'deal' ? 'לקוח' : 'פגישה חדשה'
}

/** A full-screen celebration every this many meetings booked today. */
export const MILESTONE_STEP = 3

/**
 * The eight shows, in the order they unlock. Every third meeting fires the next
 * one and the list then repeats — the point is that nobody on the floor has
 * seen tonight's next one yet, which is a cheaper reason to make one more call
 * than any leaderboard.
 */
export const CELEBRATIONS = [
  { key: 'confetti', label: 'קונפטי', emoji: '🎉', color: '#fbbf24' },
  { key: 'fireworks', label: 'זיקוקים', emoji: '🎆', color: '#f472b6' },
  { key: 'shockwave', label: 'גל הלם', emoji: '💥', color: '#38bdf8' },
  { key: 'starfall', label: 'גשם כוכבים', emoji: '⭐', color: '#facc15' },
  { key: 'bubbles', label: 'בועות', emoji: '🫧', color: '#34d399' },
  { key: 'beams', label: 'אלומות אור', emoji: '⚡', color: '#a78bfa' },
  { key: 'coins', label: 'גשם מטבעות', emoji: '🪙', color: '#fcd34d' },
  { key: 'burst', label: 'פיצוץ', emoji: '🔥', color: '#fb923c' },
]

/** Which show belongs to a milestone count. 3 → the first, 6 → the second… */
export function celebrationFor(n) {
  const level = Math.max(1, Math.round(n / MILESTONE_STEP))
  return CELEBRATIONS[(level - 1) % CELEBRATIONS.length]
}

/**
 * The highest multiple of MILESTONE_STEP in (prev, next], or null.
 *
 * Takes the HIGHEST rather than firing once per step, so a poll that catches
 * three bookings at once shows one celebration for the number now on the board
 * instead of a queue of three nobody can read.
 */
export function milestoneCrossed(prev, next) {
  const from = Math.max(0, Math.floor(prev))
  const to = Math.floor(next)
  if (to <= from) return null
  const hit = Math.floor(to / MILESTONE_STEP) * MILESTONE_STEP
  return hit > from ? hit : null
}
