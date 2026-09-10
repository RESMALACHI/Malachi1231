import { useCallback, useEffect, useState } from 'react'
import {
  Activity,
  Inbox,
  MessageCircleOff,
  RefreshCw,
  TriangleAlert,
  Users,
  Webhook,
} from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { AGENTS } from '../lib/agents'
import { getSummaryState } from '../services/whatsappService'
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

    // The live answer to "is the bot connected" comes from Green API itself.
    // app_settings.wa_health only remembers what happened on the LAST send,
    // which may have been hours ago and may never have been a send at all.
    const [lastMeeting, unassigned, leadsToday, freshLeads, sources, wa, waHealth, waLive] =
      await Promise.all([
      supabase.from('meetings').select('created_at')
        .order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('meetings').select('id', { count: 'exact', head: true }).is('agent_name', null),
      supabase.from('leads').select('id', { count: 'exact', head: true })
        .gte('created_at', midnight.toISOString()),
      supabase.from('leads').select('id', { count: 'exact', head: true }).eq('status', 'new'),
      supabase.from('lead_sources').select('id', { count: 'exact', head: true }).eq('active', true),
      supabase.from('whatsapp_instances').select('id', { count: 'exact', head: true }),
      supabase.from('app_settings').select('value').eq('key', 'wa_health').maybeSingle(),
      // Never let this one break the panel — it is a network call to a third
      // party, and everything else here is worth showing without it.
      getSummaryState().catch(() => null),
    ])

    setStat({
      lastSync: lastMeeting.data?.created_at || null,
      unassigned: unassigned.count || 0,
      leadsToday: leadsToday.count || 0,
      freshLeads: freshLeads.count || 0,
      sources: sources.count || 0,
      wa: wa.count || 0,
      waHealth: waHealth.data?.value || null,
      waLive,
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

  // The bot cannot report over WhatsApp that WhatsApp is down, so it writes
  // what happened to app_settings.wa_health and this is where it surfaces.
  // The distinction matters enormously to whoever reads it: a failed send does
  // NOT mean a lost meeting — ".פגישה" still creates the calendar event.
  //
  // TWO SIGNALS, and they answer different questions. Reading only the second
  // one had this panel calling a working bot dead:
  //
  //   waLive   — Green API, asked right now: is the number linked? This is the
  //              only thing that actually means "connected".
  //   waHealth — what happened the last time the bot TRIED to send. It is a
  //              latch: it stays as it was until the next attempt, and on a
  //              quiet morning that can be hours. It is also written on a
  //              "quotaExceeded" webhook, which is Green API warning about an
  //              allowance — not a send that failed, and not a disconnection.
  const h = stat.waHealth
  const linked = stat.waLive ? stat.waLive.state === 'authorized' : null
  // A quota warning is a warning. Everything else recorded as not-ok is a real
  // send that really failed.
  const quotaWarn = h?.ok === false && h.reason === 'quota_exceeded'
  const sendFailed = h?.ok === false && !quotaWarn

  // Red is reserved for "the bot cannot do its job", and we say that only when
  // something actually proves it: a failed send, or Green API telling us the
  // number is not linked. A quota warning while the number is linked is amber.
  const waBad = sendFailed || linked === false
  const WA_REASON = {
    no_instance: 'אין מכשיר ווצאפ מחובר לבוט.',
    network_error: 'ווצאפ לא ענה. ייתכן שזו תקלה זמנית.',
  }

  return (
    <div className="space-y-3">
      {waBad && (
        <div className="rounded-2xl border border-red-300 bg-red-50 p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-600 text-white">
              <MessageCircleOff className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="font-bold text-red-900">
                {linked === false
                  ? 'המספר של הבוט לא מקושר לווצאפ'
                  : 'הבוט לא מצליח לשלוח הודעות בווצאפ'}
              </p>
              <p className="text-xs leading-relaxed text-red-800">
                {linked === false ? (
                  <>
                    Green API מדווח על מצב <b>{stat.waLive?.state || 'לא ידוע'}</b>. צריך לסרוק
                    QR מחדש בעמוד <b>סיכום יום</b>.{' '}
                  </>
                ) : (
                  <>
                    {WA_REASON[h.reason] || `השליחה נכשלה (${h.reason || 'סיבה לא ידועה'}).`}{' '}
                  </>
                )}
                <b>הפגישות עצמן נוצרות כרגיל</b> — פקודת <b>.פגישה</b> ממשיכה ליצור את
                האירוע ביומן, רק הודעת האישור בקבוצה לא נשלחת.
                {sendFailed && <> נכשל לאחרונה {ago(h.at)}.</>}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* A quota warning while the number is still linked. Worth saying, not
          worth alarming about: nothing has failed yet. */}
      {!waBad && quotaWarn && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white">
              <TriangleAlert className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="font-bold text-amber-900">Green API מדווח על חריגה במכסה</p>
              <p className="text-xs leading-relaxed text-amber-800">
                {linked
                  ? 'הבוט מחובר ועובד — הדיווח הזה הוא אזהרה על המכסה של החבילה, לא תקלה. '
                  : ''}
                אם המכסה תיגמר, הודעות האישור בקבוצה יפסיקו להישלח (הפגישות עצמן ימשיכו
                להיווצר). הדיווח התקבל {ago(h.at)}.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* When the bot is fine, say so — an empty space reads as "unknown". */}
      {!waBad && !quotaWarn && linked && (
        <p className="px-1 text-xs text-slate-500">
          ווצאפ הבוט מחובר
          {h?.ok === true && <> · שליחה אחרונה הצליחה {ago(h.at)}</>}
        </p>
      )}

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
