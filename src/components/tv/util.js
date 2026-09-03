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
  if (item.kind === 'deal') return String(item.who || '').trim() || 'לקוח'
  const cleaned = clientName(item.who, item.agent)
  return cleaned && cleaned !== '(ללא פרטים)' ? cleaned : String(item.who || 'פגישה חדשה')
}

/** The milestones worth a full-screen celebration, in order. */
export const MILESTONES = [5, 10, 15, 20, 25, 30, 35, 40, 50, 60, 75, 100, 125, 150]

/** The highest milestone strictly between `prev` and `next`, or null. */
export function milestoneCrossed(prev, next) {
  let hit = null
  for (const m of MILESTONES) {
    if (m > prev && m <= next) hit = m
  }
  return hit
}
