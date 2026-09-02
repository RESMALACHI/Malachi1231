// Everything "היום שלי" needs, in one round trip.
//
// The screen is a day-planner in the BMBY layout the team already reads all
// day: meetings on one side, tasks on the other, each split into "today",
// "upcoming" and "not updated". One loader fans out in parallel and the
// bucketing happens here, so the page only renders.

import { supabase } from '../lib/supabaseClient'
import { getAllMeetingsInRange, getMeetingsInRange, getMeetingsSince } from './meetingsService'
import { dueLeadTasks, listLeads } from './leadsService'

// Tasks exist from June onward — same cutoff the tasks page itself uses.
const TASKS_SINCE = '2026-06-01'
// How far back "לא מעודכנות" reaches, and how far ahead the planner looks.
const PAST_DAYS = 14
const AHEAD_DAYS = 7

const pad = (n) => String(n).padStart(2, '0')
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** "יום א' 31/08/2026" — the section header an upcoming day gets. */
export function dayLabel(d) {
  const names = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'שבת']
  return `יום ${names[d.getDay()]} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

export async function getTodayBundle(agentName, viewAll = false) {
  const now = new Date()
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const from = new Date(start)
  from.setDate(from.getDate() - PAST_DAYS)
  const to = new Date(start)
  to.setDate(to.getDate() + AHEAD_DAYS + 1)

  const [meetings, leads, taskSource, summaryRes, leadTasks] = await Promise.all([
    viewAll
      ? getAllMeetingsInRange(from.toISOString(), to.toISOString())
      : getMeetingsInRange(agentName, from.toISOString(), to.toISOString()),
    listLeads({ agentName: viewAll ? null : agentName, limit: 100 }),
    viewAll ? Promise.resolve([]) : getMeetingsSince(agentName, TASKS_SINCE),
    viewAll
      ? Promise.resolve(null)
      : supabase
          .from('day_summaries')
          .select('id', { count: 'exact', head: true })
          .eq('agent_name', agentName)
          .eq('summary_date', dayKey(now)),
    dueLeadTasks(viewAll ? null : agentName).catch(() => []),
  ])

  const todayK = dayKey(now)
  const sorted = [...meetings].sort((a, b) => new Date(a.meeting_date) - new Date(b.meeting_date))

  const todayMeetings = []
  const pastPending = []
  const upcomingMap = new Map() // dateKey -> { label, items }

  for (const m of sorted) {
    const d = new Date(m.meeting_date)
    const k = dayKey(d)
    if (k === todayK) {
      todayMeetings.push(m)
    } else if (d < start) {
      // The BMBY "לא מעודכנות" rule: a past meeting still without an outcome.
      if (m.status === 'pending') pastPending.push(m)
    } else {
      if (!upcomingMap.has(k)) upcomingMap.set(k, { key: k, label: dayLabel(d), items: [] })
      upcomingMap.get(k).items.push(m)
    }
  }
  // Newest unmarked first — the freshest is the one someone still remembers.
  pastPending.reverse()

  const todayDone = todayMeetings.filter((m) => m.status !== 'pending').length

  return {
    todayMeetings,
    upcoming: [...upcomingMap.values()],
    pastPending,
    counts: {
      plannedToday: todayMeetings.length,
      doneToday: todayDone,
      unmarked: pastPending.length,
    },
    leads: leads.filter((l) => l.status !== 'done'),
    leadTasksToday: leadTasks.filter((t) => t.due_date === todayK),
    leadTasksOverdue: leadTasks.filter((t) => t.due_date < todayK),
    followupsOpen: taskSource.filter(
      (m) => (m.status === 'attended' || m.status === 'no_show') && !m.task_done
    ).length,
    summaryFiled: summaryRes === null ? null : (summaryRes.count || 0) > 0,
  }
}
