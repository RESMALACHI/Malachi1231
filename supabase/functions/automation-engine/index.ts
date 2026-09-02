// Supabase Edge Function: automation-engine
//
// Runs the rules the admin composed in ניהול → אוטומציות. A pg_cron job calls
// this every 5 minutes; the panel can also call it signed-in, with { peek }
// to see what WOULD fire without firing it.
//
// THE ONE RULE OF THIS FILE: nothing fires twice. Every (rule, entity) pair
// that acted is written to automation_fired, and candidates are filtered
// against it before anything happens. An automation the team cannot trust to
// shut up gets switched off within a day — dedup is the feature.
//
// Auth: cron calls carry ?t=<app_auth.sync_token> (the sync-meetings pattern);
// browser calls carry a signed-in user's JWT. Either passes, nothing else.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

// Storm guards. A first-enable against months of stale rows must trickle, not
// flood: whatever exceeds the caps waits for the next tick.
const MAX_ENTITIES_PER_RULE = 10
const MAX_ACTIONS_PER_RUN = 40

interface Entity {
  key: string          // dedup key
  agent: string | null // who this belongs to
  clientName: string
  phone: string
  when: string | null  // the meeting's time, if any
  subject: string      // one line for the log
}

/** "פגישה פרונטלית - דנה כהן - מלאכי אזערי - אישרה" → "דנה כהן".
 *  The middle segment of the title convention; good enough for a message. */
function nameFromTitle(title: string): string {
  const parts = String(title || '').split(' - ').map((s) => s.trim())
  return parts.length >= 2 ? parts[1] : parts[0] || ''
}

/** First Israeli mobile in the meeting's text. */
function phoneFrom(m: any): string {
  const hay = `${m.title || ''} ${m.description || ''}`.replace(/[^\d]/g, ' ')
  const hit = hay.match(/0?5\d{8}/)
  if (!hit) return ''
  return hit[0].length === 9 ? '0' + hit[0] : hit[0]
}

const pad = (n: number) => String(n).padStart(2, '0')
function heTime(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: '', time: '' }
  const d = new Date(iso)
  // The office runs on Israel time; the server does not.
  const il = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }))
  return {
    date: `${pad(il.getDate())}/${pad(il.getMonth() + 1)}/${il.getFullYear()}`,
    time: `${pad(il.getHours())}:${pad(il.getMinutes())}`,
  }
}

/** The same placeholders personal WhatsApp templates use, filled per entity. */
function render(text: string, e: Entity): string {
  const { date, time } = heTime(e.when)
  return String(text || '')
    .replaceAll('{שם}', e.clientName)
    .replaceAll('{תאריך}', date)
    .replaceAll('{שעה}', time)
    .replaceAll('{סוכן}', String(e.agent || '').split(/\s+/)[0] || '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** WhatsApp digits form. */
function toChatId(phone: string): string | null {
  let d = String(phone || '').replace(/\D/g, '')
  if (d.startsWith('972')) { /* already international */ }
  else if (d.startsWith('0')) d = '972' + d.slice(1)
  else if (d.length === 9 && d.startsWith('5')) d = '972' + d
  return d.length >= 11 ? `${d}@c.us` : null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    const url = new URL(req.url)
    const body = await req.json().catch(() => ({}))
    const peek = body.peek === true

    // ── Either the cron secret or a signed-in person ──
    const { data: tokRow } = await admin
      .from('app_auth').select('value').eq('key', 'sync_token').maybeSingle()
    const tokenOk = !!tokRow?.value && url.searchParams.get('t') === tokRow.value

    let userOk = false
    if (!tokenOk) {
      const userClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } }
      )
      const { data: { user } } = await userClient.auth.getUser()
      userOk = !!user
    }
    if (!tokenOk && !userOk) return json({ error: 'unauthorized' }, 401)

    const { data: rules } = await admin
      .from('automation_rules')
      .select('*')
      .eq('enabled', true)
      .order('created_at', { ascending: true })

    if (!rules?.length) return json({ ok: true, rules: 0, fired: 0 })

    const now = Date.now()
    const iso = (msAgo: number) => new Date(now - msAgo).toISOString()
    const results: any[] = []
    let actionsUsed = 0

    // Config rows fetched once for the whole run.
    const [{ data: pushTok }, { data: rosterRow }] = await Promise.all([
      admin.from('app_auth').select('value').eq('key', 'push_token').maybeSingle(),
      admin.from('app_settings').select('value').eq('key', 'roster').maybeSingle(),
    ])
    const roster: any[] = rosterRow?.value?.agents || []
    const adminAgent =
      roster.find((a) => (a.roles || []).includes('admin'))?.name || 'מלאכי אזערי'
    const fieldAgents = roster
      .filter((a) => (Array.isArray(a.roles) ? a.roles.includes('agent') : a.role !== 'manager'))
      .map((a) => String(a.name))

    const sendPush = async (agentName: string, title: string, msg: string) => {
      if (!pushTok?.value) return { ok: false, detail: 'no push_token' }
      const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send', token: pushTok.value, agentName, title, body: msg, url: '/today',
        }),
      })
      const out = await res.json().catch(() => ({}))
      return { ok: res.ok, detail: JSON.stringify(out).slice(0, 120) }
    }

    const sendWhatsApp = async (agentName: string, phone: string, message: string) => {
      const chatId = toChatId(phone)
      if (!chatId) return { ok: false, detail: 'bad phone' }
      const { data: inst } = await admin
        .from('whatsapp_instances')
        .select('id_instance, api_token, api_url')
        .eq('agent_name', agentName)
        .maybeSingle()
      if (!inst) return { ok: false, detail: `${agentName}: אין ווצאפ מחובר` }
      const apiUrl = String(inst.api_url || 'https://api.green-api.com').replace(/\/$/, '')
      const res = await fetch(
        `${apiUrl}/waInstance${inst.id_instance}/sendMessage/${inst.api_token}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId, message }),
        }
      )
      const out = await res.json().catch(() => ({}))
      return { ok: res.ok && !!out?.idMessage, detail: JSON.stringify(out).slice(0, 120) }
    }

    for (const rule of rules) {
      const p = rule.trigger_params || {}
      let entities: Entity[] = []

      // ── Find candidates ──
      if (rule.trigger_type === 'lead_untouched') {
        const minutes = Math.max(5, Number(p.minutes) || 60)
        const { data } = await admin
          .from('leads')
          .select('id, agent_name, name, phone, created_at')
          .neq('status', 'done')
          .lte('created_at', iso(minutes * 60_000))
          .gte('created_at', iso(7 * 86_400_000)) // a week back, not archaeology
          .limit(50)
        entities = (data || []).map((l) => ({
          key: `lead:${l.id}`,
          agent: l.agent_name,
          clientName: l.name || 'ליד ללא שם',
          phone: l.phone || '',
          when: null,
          subject: `ליד ${l.name || l.phone || l.id} ממתין`,
        }))
      } else if (rule.trigger_type === 'meeting_upcoming') {
        const hours = Math.max(1, Number(p.hours) || 3)
        const { data } = await admin
          .from('meetings')
          .select('id, agent_name, title, description, meeting_date')
          .gt('meeting_date', new Date(now).toISOString())
          .lte('meeting_date', new Date(now + hours * 3_600_000).toISOString())
          .not('agent_name', 'is', null)
          .limit(50)
        entities = (data || []).map((m) => ({
          key: `meet-up:${m.id}`,
          agent: m.agent_name,
          clientName: nameFromTitle(m.title),
          phone: phoneFrom(m),
          when: m.meeting_date,
          subject: `פגישה מתקרבת: ${nameFromTitle(m.title)}`,
        }))
      } else if (rule.trigger_type === 'meeting_unmarked') {
        const hours = Math.max(1, Number(p.hours) || 2)
        const { data } = await admin
          .from('meetings')
          .select('id, agent_name, title, description, meeting_date, status')
          .eq('status', 'pending')
          .lte('meeting_date', iso(hours * 3_600_000))
          .gte('meeting_date', iso(3 * 86_400_000)) // three days back, then let it rest
          .not('agent_name', 'is', null)
          .limit(50)
        entities = (data || []).map((m) => ({
          key: `meet-unmarked:${m.id}`,
          agent: m.agent_name,
          clientName: nameFromTitle(m.title),
          phone: phoneFrom(m),
          when: m.meeting_date,
          subject: `לא סומנה: ${nameFromTitle(m.title)}`,
        }))
      } else if (rule.trigger_type === 'meeting_no_show') {
        const { data } = await admin
          .from('meetings')
          .select('id, agent_name, title, description, meeting_date, status')
          .eq('status', 'no_show')
          .gte('meeting_date', iso(3 * 86_400_000))
          .not('agent_name', 'is', null)
          .limit(50)
        entities = (data || []).map((m) => ({
          key: `meet-noshow:${m.id}`,
          agent: m.agent_name,
          clientName: nameFromTitle(m.title),
          phone: phoneFrom(m),
          when: m.meeting_date,
          subject: `לא הגיע: ${nameFromTitle(m.title)}`,
        }))
      }

      // ── Never twice ──
      if (entities.length) {
        const { data: fired } = await admin
          .from('automation_fired')
          .select('entity_key')
          .eq('rule_id', rule.id)
          .in('entity_key', entities.map((e) => e.key))
        const seen = new Set((fired || []).map((f: any) => f.entity_key))
        entities = entities.filter((e) => !seen.has(e.key)).slice(0, MAX_ENTITIES_PER_RULE)
      }

      if (peek) {
        results.push({ rule: rule.name, would_fire: entities.map((e) => e.subject) })
        continue
      }

      // ── Act ──
      let firedCount = 0
      for (const e of entities) {
        if (actionsUsed >= MAX_ACTIONS_PER_RUN) break
        const outcomes: string[] = []
        let allOk = true

        for (const act of rule.actions || []) {
          if (actionsUsed >= MAX_ACTIONS_PER_RUN) break
          actionsUsed++

          if (act.type === 'push_agent' && e.agent) {
            const r = await sendPush(
              e.agent,
              render(act.title || 'תזכורת מהמערכת', e),
              render(act.body || e.subject, e)
            )
            outcomes.push(`push→${e.agent}:${r.ok ? 'ok' : r.detail}`)
            allOk = allOk && r.ok
          } else if (act.type === 'push_admin') {
            const r = await sendPush(
              adminAgent,
              render(act.title || 'התראת מערכת', e),
              render(act.body || `${e.subject} (${e.agent || 'ללא סוכן'})`, e)
            )
            outcomes.push(`push→${adminAgent}:${r.ok ? 'ok' : r.detail}`)
            allOk = allOk && r.ok
          } else if (act.type === 'wa_client') {
            if (!e.phone || !e.agent) {
              outcomes.push('wa:skip(no phone/agent)')
            } else {
              const r = await sendWhatsApp(e.agent, e.phone, render(act.message || '', e))
              outcomes.push(`wa→${e.phone}:${r.ok ? 'ok' : r.detail}`)
              allOk = allOk && r.ok
            }
          } else if (act.type === 'reassign_lead' && e.key.startsWith('lead:')) {
            // To whoever waited longest, never back to the current owner.
            const pool = fieldAgents.filter((a) => a !== e.agent)
            if (pool.length) {
              const { data: recent } = await admin
                .from('leads')
                .select('agent_name, created_at')
                .not('agent_name', 'is', null)
                .order('created_at', { ascending: false })
                .limit(200)
              const lastSeen = new Map<string, string>()
              for (const r of recent || []) {
                if (!lastSeen.has(r.agent_name)) lastSeen.set(r.agent_name, r.created_at)
              }
              const next = pool.sort((a, b) =>
                (lastSeen.get(a) || '').localeCompare(lastSeen.get(b) || '')
              )[0]
              await admin.from('leads').update({ agent_name: next }).eq('id', e.key.slice(5))
              await sendPush(next, 'ליד הועבר אליך', `${e.clientName} — לא טופל אצל ${e.agent || 'אף אחד'}`)
              outcomes.push(`reassign→${next}`)
            } else {
              outcomes.push('reassign:skip(no pool)')
            }
          }
        }

        // The ledger row goes in even when an action failed: a broken WhatsApp
        // credential must not translate into the same client being messaged on
        // every tick until someone notices.
        await admin.from('automation_fired').insert({ rule_id: rule.id, entity_key: e.key })
        await admin.from('automation_log').insert({
          rule_id: rule.id,
          subject: e.subject,
          detail: outcomes.join(' | ').slice(0, 500),
          ok: allOk,
        })
        firedCount++
      }

      if (firedCount > 0) {
        await admin
          .from('automation_rules')
          .update({ runs: (rule.runs || 0) + firedCount, last_run_at: new Date().toISOString() })
          .eq('id', rule.id)
      }
      results.push({ rule: rule.name, fired: firedCount })
    }

    return json({ ok: true, peek, rules: rules.length, results })
  } catch (e) {
    console.error('[automation-engine]', String(e))
    return json({ error: String(e).slice(0, 300) }, 500)
  }
})
