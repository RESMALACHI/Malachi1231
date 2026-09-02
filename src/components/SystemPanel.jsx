import { useCallback, useEffect, useState } from 'react'
import { Activity, Inbox, RefreshCw, Users, Webhook } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { AGENTS } from '../lib/agents'
import Spinner from './Spinner'

/** "לפני 4 דקות" — how long ago, in the words people use. */
function ago(iso) {
  if (!iso) return 'מעולם'
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'הרגע'
  if (mins < 60) return `לפני ${mins} דק׳`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `לפני ${hrs} שע׳`
  return `לפני ${Math.round(hrs / 24)} ימים`
}

/**
 * Is the machine running?
 *
 * The one number that matters is when a meeting last arrived from the calendar.
 * Everything else in this app is downstream of that sync, and when it stops the
 * app does not look broken — it looks like a quiet week. So the freshness is
 * stated in words and turns red once it passes an hour, which is well past the
 * five-minute cron and still short of anyone noticing on their own.
 */
export default function SystemPanel() {
  const [stat, setStat] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const midnight = new Date()
    midnight.setHours(0, 0, 0, 0)

    const [lastMeeting, unassigned, leadsToday, freshLeads, sources, wa] = await Promise.all([
      supabase.from('meetings').select('created_at')
        .order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('meetings').select('id', { count: 'exact', head: true }).is('agent_name', null),
      supabase.from('leads').select('id', { count: 'exact', head: true })
        .gte('created_at', midnight.toISOString()),
      supabase.from('leads').select('id', { count: 'exact', head: true }).eq('status', 'new'),
      supabase.from('lead_sources').select('id', { count: 'exact', head: true }).eq('active', true),
      supabase.from('whatsapp_instances').select('id', { count: 'exact', head: true }),
    ])

    setStat({
      lastSync: lastMeeting.data?.created_at || null,
      unassigned: unassigned.count || 0,
      leadsToday: leadsToday.count || 0,
      freshLeads: freshLeads.count || 0,
      sources: sources.count || 0,
      wa: wa.count || 0,
    })
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (!stat) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    )
  }

  const stale = stat.lastSync
    ? Date.now() - new Date(stat.lastSync).getTime() > 60 * 60 * 1000
    : true

  return (
    <div className="space-y-3">
      {/* The health line */}
      <div
        className={`rounded-2xl border p-4 ${
          stale ? 'border-amber-300 bg-amber-50' : 'border-green-200 bg-green-50'
        }`}
      >
        <div className="flex items-center gap-3">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              stale ? 'bg-amber-500 text-white' : 'bg-green-600 text-white'
            }`}
          >
            <Activity className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="font-bold text-slate-900">
              {stale ? 'לא נקלטה פגישה כבר יותר משעה' : 'סנכרון היומן פעיל'}
            </p>
            <p className="text-xs text-slate-600">
              הפגישה האחרונה שנקלטה: {ago(stat.lastSync)}
              {stale && ' — ייתכן שפשוט לא נקבעו פגישות, וייתכן שהסנכרון נתקע'}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon={Users} label="סוכנים" value={AGENTS.length} />
        <Stat icon={Inbox} label="פגישות אבודות" value={stat.unassigned} tone={stat.unassigned > 0 ? 'warn' : ''} />
        <Stat icon={Webhook} label="מקורות לידים פעילים" value={stat.sources} />
        <Stat icon={Inbox} label="לידים חדשים" value={stat.freshLeads} tone={stat.freshLeads > 0 ? 'good' : ''} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat icon={Inbox} label="לידים היום" value={stat.leadsToday} />
        <Stat icon={Users} label="מכשירי ווצאפ מחוברים" value={stat.wa} />
      </div>

      <button
        onClick={async () => {
          setBusy(true)
          await load()
          setBusy(false)
        }}
        disabled={busy}
        className="btn-ghost w-full gap-2"
      >
        <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} aria-hidden="true" />
        רענון
      </button>
    </div>
  )
}

function Stat({ icon: Icon, label, value, tone = '' }) {
  const ring =
    tone === 'warn' ? 'ring-amber-200' : tone === 'good' ? 'ring-green-200' : 'ring-slate-200'
  return (
    <div className={`rounded-2xl bg-white p-3 ring-1 ${ring}`}>
      <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </span>
      <p className="mt-1 text-2xl font-extrabold text-slate-900">{value}</p>
    </div>
  )
}
