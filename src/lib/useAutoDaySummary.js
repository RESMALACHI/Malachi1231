// "Tell me to file my day summary when I leave the office."
//
// WHAT THIS CANNOT BE: a background geofence. No browser ships the Geofencing
// API, and JavaScript stops within seconds of a phone's screen locking — on
// iOS immediately. Nothing can run at the exact moment someone walks out.
//
// WHAT IT IS INSTEAD: an agent touches this app many times a day. Every time it
// is opened or comes back to the foreground we take one position fix, and if
// that fix says they are outside the office radius we raise a notification.
// Tapping it opens the summary form, already filled from the calendar. In
// practice it lands the first time they pick up their phone after leaving.
//
// THE LATCH IS AN EDGE, NOT A DAY. There is deliberately no cut-off hour any
// more — a person who leaves at 11:00 gets asked at 11:00. That only works
// because the trigger is the *crossing*: it fires when they go from inside to
// outside, and re-arms when they come back. A once-a-day latch plus no hour
// limit would spend the day's single reminder on the lunch run and stay silent
// at the actual departure.
//
// No position is ever stored — a fix is compared to the office and dropped.
// See lib/geo.js.

import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { isFieldAgent, managerViewOnly } from './agents'
import { distanceMeters, getPosition, hasLocationPermission } from './geo'
import { canNotify, notifyLocal } from './notify'
import { getOffice } from '../services/settingsService'
import { getMyDaySummary, localDateKey } from '../services/daySummaryService'

/** Per-device opt-in. Off until the agent turns it on from the summary page. */
const OPT_IN_KEY = 'mt_auto_day_summary'
/** 'in' | 'out' — which side of the fence the last usable fix put them on. */
const ZONE_KEY = 'mt_auto_day_summary_zone'
/** When we last raised the reminder, so a fix wobbling on the line can't spam. */
const LAST_KEY = 'mt_auto_day_summary_last'

/** Two reminders can never land closer together than this, whatever the GPS says. */
const COOLDOWN_MS = 45 * 60_000

const read = (key) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
const write = (key, value) => {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* private mode — the feature just won't remember, which is survivable */
  }
}

export function autoSummaryEnabled() {
  return read(OPT_IN_KEY) === 'on'
}

export function setAutoSummaryEnabled(on) {
  write(OPT_IN_KEY, on ? 'on' : 'off')
  // A fresh start next time, rather than inheriting a stale "already outside".
  if (!on) write(ZONE_KEY, '')
}

/**
 * Which side of the fence a fix puts someone on, or null for "can't tell".
 *
 * The two answers are deliberately NOT symmetric. "Outside" has to clear the
 * radius by the fix's whole error margin, because a wrong "outside" nags
 * someone sitting at their desk. "Inside" is the raw distance, because all a
 * wrong "inside" does is re-arm the latch for a departure that has to be
 * confirmed by the strict test anyway. Between the two the answer is null and
 * the latch does not move.
 *
 * The asymmetry is load-bearing at this branch's 50 m radius: a phone fix is
 * routinely accurate to ±30 m, so a symmetric test would need d < 20 m to say
 * "inside" and would essentially never re-arm — one reminder, ever.
 */
export function zoneFor(pos, office) {
  const d = distanceMeters(pos, office)
  if (d - (pos.accuracy || 0) > office.radiusM) return 'out'
  if (d < office.radiusM) return 'in'
  return null
}

export function useAutoDaySummary() {
  const navigate = useNavigate()
  const { selectedAgent } = useAuth()
  // One check in flight at a time; a foreground event can land mid-fix.
  const busy = useRef(false)

  useEffect(() => {
    const agent = selectedAgent
    if (!agent || !isFieldAgent(agent) || managerViewOnly(agent)) return
    if (!autoSummaryEnabled()) return

    const check = async () => {
      if (busy.current) return
      if (window.location.pathname === '/day-summary') return

      busy.current = true
      try {
        const office = await getOffice()
        // afterHour 0 means "any time", which is now the default. A manager who
        // wants lunchtime trips ignored can still put an hour back in ניהול.
        if (office.afterHour > 0 && new Date().getHours() < office.afterHour) return

        // Never prompt for location out of nowhere. The toggle on the summary
        // page is what asks; if that permission is gone, so is the feature.
        if ((await hasLocationPermission()) === false) return

        const pos = await getPosition()
        if (!pos) return
        const zone = zoneFor(pos, office)
        if (!zone) return // on the line — leave the latch exactly as it was

        const was = read(ZONE_KEY)
        write(ZONE_KEY, zone)
        // Only the crossing counts. Still outside from the last check means
        // they have already been asked.
        if (zone === 'in' || was === 'out') return

        const since = Number(read(LAST_KEY)) || 0
        if (Date.now() - since < COOLDOWN_MS) return

        // Nothing to ask for if it is already filed.
        const filed = await getMyDaySummary(agent, localDateKey()).catch(() => null)
        if (filed?.sent_at) return

        write(LAST_KEY, String(Date.now()))

        const shown = await notifyLocal({
          title: 'סיכום יום',
          body: `יצאת מ${office.label} — רגע לסכם את היום? הטופס כבר מלא במה שהמערכת יודעת.`,
          url: '/day-summary',
          tag: 'day-summary',
        })
        // No notification permission on this device: fall back to the old
        // behaviour rather than reminding nobody of anything.
        if (!shown && !canNotify()) navigate('/day-summary')
      } catch {
        /* the day summary is not worth an error message on someone's screen */
      } finally {
        busy.current = false
      }
    }

    check()
    const onVisible = () => document.visibilityState === 'visible' && check()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [selectedAgent, navigate])
}
