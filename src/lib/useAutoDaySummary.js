// "Open my day summary when I leave the office."
//
// WHAT THIS CANNOT BE: a background geofence. No browser ships the Geofencing
// API, and JavaScript stops within seconds of a phone's screen locking — on
// iOS immediately. Nothing can run at the moment someone walks out of the door.
//
// WHAT IT IS INSTEAD: an agent opens this app many times a day. So every time
// the app is opened or comes back to the foreground, and only when it is
// plausibly worth asking — after the office's cut-off hour, on a day whose
// summary is not filed yet, at most once a day — we take a single position fix.
// If they are outside the office radius, the summary form opens by itself,
// already filled with the meetings the calendar knows about.
//
// In practice this fires the first time they touch their phone after leaving,
// which is what the request was actually asking for. The position is compared
// and dropped; see lib/geo.js.

import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { isFieldAgent, managerViewOnly } from './agents'
import { distanceMeters, getPosition, hasLocationPermission } from './geo'
import { getOffice } from '../services/settingsService'
import { getMyDaySummary, localDateKey } from '../services/daySummaryService'

/** Per-device opt-in. Off until the agent turns it on from the summary page. */
const OPT_IN_KEY = 'mt_auto_day_summary'
/** Remembers the last day we already opened the form, so it asks once. */
const FIRED_KEY = 'mt_auto_day_summary_fired'

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
      const today = localDateKey()
      if (read(FIRED_KEY) === today) return
      if (window.location.pathname === '/day-summary') return

      busy.current = true
      try {
        const office = await getOffice()
        if (new Date().getHours() < office.afterHour) return

        // Never prompt for location out of nowhere. The toggle on the summary
        // page is what asks; if that permission is gone, so is the feature.
        if ((await hasLocationPermission()) === false) return

        const filed = await getMyDaySummary(agent, today).catch(() => null)
        if (filed?.sent_at) return

        const pos = await getPosition()
        if (!pos) return

        // Give the fix's own error margin the benefit of the doubt, so a rough
        // position taken indoors can't read as "left" while they're at a desk.
        const away = distanceMeters(pos, office) - (pos.accuracy || 0) > office.radiusM
        if (!away) return

        write(FIRED_KEY, today)
        navigate('/day-summary')
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
