# CLAUDE.md — read this first

Internal CRM for **מכללת R.E.S** (a real-estate college). Hebrew, RTL. Sales
agents track meetings, attendance and deals; managers see aggregates; a WhatsApp
bot books meetings into Google Calendar. It is a live tool the office runs on all
day — treat production accordingly.

> `README.md` is **stale** (it describes an old per-user Google-OAuth version).
> This file is the current truth.

## Stack

| | |
|---|---|
| Frontend | Vite + React 18 + React Router 6 + Tailwind 3 + lucide-react. **No TypeScript, no tests, no ESLint config.** |
| Backend | Supabase — Postgres + Auth + ~25 Edge Functions (Deno/TS) in `supabase/functions/` |
| Hosting | Vercel project `res-meetings` (account `resmeta1234@gmail.com`), live at `res-meetings.vercel.app` |
| Integrations | Google Calendar (iCal feeds in, Service Account out), Green API (WhatsApp — **unofficial**), Groq/Gemini (AI), Web Push |

Dev: `npm run dev` (port 5173) · `npm run build` · `npm run build:ext` (Chrome extension)

## Deploy — git only

`git push` to `main` → Vercel auto-builds → production. **Do not run `vercel deploy`.**
Two machines once diverged by deploying via the CLI; everything now goes through git.
If you see a `.vercel/` folder locally, ignore it — it points at an old project.

Pushes authenticate as GitHub user **`RESMALACHI`** (repo `RESMALACHI/Malachi1231`).
The machine's cached git credential may be a *different* account with no write access.

## Auth model — NOT per-user

There are no personal accounts. Entry is a **team-knowledge question** ("which CRM do
we use?") checked server-side by the `team-login` edge function, which returns a
session for **one shared Supabase account**. The user then picks their name from a
client-side **roster**; some names ask for a 4-digit PIN (a client-side gate only).

"Who am I" = `selectedAgent` in `localStorage` — **not a database identity**.
Consequence: every RLS policy is just `auth.uid() is not null`. Any signed-in
session can read/write everything. Role gating (agent / manager / admin) is
enforced **only in the UI**, from the roster.

- Roster: `app_settings` key `roster` (JSON, edited in the ניהול page). Fallback:
  `BUILTIN_ROSTER` in `src/lib/agents.js`. Roles stack.
- `src/lib/agents.js` uses live `let` bindings swapped by `applyRoster()`; an admin
  edit reloads the page. Don't "fix" this into `const`.

## Config & secrets — the `app_auth` table

Almost all real config lives in Postgres table **`app_auth`** (key/value, **no RLS**,
service-role only). Keys include: `team_answers`, `shared_email`/`shared_password`,
`gcal_sa_json`, `gcal_cal_zahar`/`gcal_cal_ramatgan`, `gcal_client_*`,
`wa_webhook_token`, `wa_meeting_group`, `wa_summary_group`, `sync_token`,
`push_token`, `crm_bridge_token`, `ai_key`/`ai_endpoint`/`ai_model`/`ai_provider`,
`gemini_api_key`, `vapid_*`. Changing an AI model or key is one `UPDATE`, no deploy.

Frontend env: only `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (also hard-coded
in `vercel.json` build.env — the anon key is public by design). Supabase project ref
`uhmzdhtjabhbcyslovfk` is hard-coded in a few places (extension manifest, vercel.json).

Edge function env secrets (set via `supabase secrets set`): `ICAL_URLS`,
`ACCOUNTING_WHATSAPP_NUMBER`, `GREENAPI_*`, `CRM_*`.

## Supabase — the migrations are incomplete

`supabase/migrations/` only covers 0001–0013: `profiles`, `meetings`, `messages`,
`app_settings`, `whatsapp_instances`, `wa_links`, `user_google_tokens`.

**Many live tables were created by hand in the SQL editor and are NOT in git:**
`leads`, `lead_sources`, `lead_activities`, `deals`, `day_summaries`,
`automation_rules`, `automation_fired`, `automation_log`, `assistant_messages`,
`push_subscriptions`, `push_actions`, `transcription_usage`, `wa_processed`,
`app_auth`, `wa_templates`. Plus RPCs: `company_funnel`, `rename_agent`,
`agent_footprint`, `bump_lead_source`, `is_admin`.

There is no way to recreate the DB from git. Be careful with any schema change.

## Data flow (meetings)

Central Google Calendars → secret iCal feeds (`ICAL_URLS`) → `calendar-feed` /
`sync-meetings` edge fns parse the `.ics`, classify each event to an agent, write
to `meetings`.

**Ownership needs an explicit label.** A meeting is assigned only when something in
the event reads "מתאם הפגישה: X" / "מנהלת פגישה: X" — the line `.פגישה` always
writes. A name merely appearing in the text assigns nothing, and an event with no
label belongs to nobody and lands in the Claim Yard, where it can be assigned by
hand. This replaced a 3-tier guess in Sept 2026: once every agent had moved to
`.פגישה`, the guess only ever fired on things like "איציק תפוס" — a calendar block
filed as איציק's meeting. `classifyAgent` exists TWICE (calendar-feed/index.ts and
sync-meetings/feed.ts) and the two must stay identical, or the manual "סנכרן"
button and the cron would disagree about who owns a meeting.

**`agent_name` is written once, at INSERT, and never recomputed** — the update path
deliberately omits it so a manual Claim Yard assignment survives the next sync. The
cost: an event the sync caught before its details were filled in stays unassigned
for ever.
`sync-meetings` runs on pg_cron (~5 min); the client's `syncService.js` mirrors the
same logic for the manual "סנכרן" button. **Deletions happen only when every feed
answered** — a feed that didn't respond means "keep", because attendance marks drive
pay.

"Booked" is `event_created_at` (created in Google Calendar), never `created_at`
(when our sync first saw the row).

## WhatsApp bot

`wa-webhook` receives Green API webhooks. `.פגישה` in an allowed group →
`parseMeeting.ts` → create a Google Calendar event via a **Service Account** JWT →
routed to the zahar / ramat-gan calendar by the "יומן:" field. Also `.היום`/`.מחר`,
and `.בוט <שאלה>` (`ask.ts`) — a snapshot of today / tomorrow / this month is built
here and the model answers off that text alone; it never touches the database.
Every reply starts with a marker in `BOT_REPLY_MARKERS` so the bot skips its own
messages — add one for any new reply style.

**Swapping the bot's Green API instance** (ניהול → ווצאפ הבוט, `save_shared`).
Three things bite, in this order:
1. **`apiUrl` is per-instance now** — `https://7105.api.greenapi.com`, not the old
   shared `api.green-api.com`. Wrong host = every call 404s and the bot looks dead.
2. **A new instance ships with every webhook OFF and no URL.** Set `webhookUrl` to
   `.../functions/v1/wa-webhook?t=<app_auth.wa_webhook_token>` and turn on
   `incomingWebhook`, `outgoingWebhook`, `outgoingMessageWebhook`,
   `outgoingAPIMessageWebhook` (the bot accepts `.פגישה` from any device).
   `POST {apiUrl}/waInstance{id}/setSettings/{token}`.
3. **Same phone number** — a different one is not in the meetings group.
Check state with `GET {apiUrl}/waInstance{id}/getStateInstance/{token}` and confirm
a real send with `app_settings.wa_health` (`ok:true` = a reply actually went out).

**Edge functions: deploy via MCP.** `npx supabase@latest` does run here (2.117.0)
but is NOT logged in and `supabase login` needs a browser, so use the Supabase MCP
`deploy_edge_function` (project `uhmzdhtjabhbcyslovfk`) — it replaces ALL files, so
send every file, and keep `verify_jwt: false` on `wa-webhook` (Green API cannot send
a JWT). Smoke-test a deploy without touching WhatsApp:
`curl -X POST ".../wa-webhook?t=wrong" -d '{"typeWebhook":"incomingMessageReceived"}'`
→ `{"ignored":"bad_token"}` means the module booted.
Green API's free plan is flaky, so `wa-notification-consumer` + `wa-journal-poller`
drain its HTTP queue / journals as a fallback. `wa_processed` dedupes.

Meta's official WhatsApp Cloud API cannot replace this: it has no group messaging
and would take over each agent's personal number.

## Danger zones — think before touching

- **`src/lib/bonus.js` + `src/lib/dealsBonus.js`** — real payroll. Meeting-bonus
  tiers, deal commission brackets, the 10-meeting gate, meeting-OR-deal-bonus. Add
  tests before changing anything here.
- **RLS / `team-login` / the shared account** — the whole auth model rests on it.
- **The sync's delete rule** — deleting a real meeting also discards its attendance
  mark. The "only delete when all feeds answered" guard is load-bearing.
- **Timezones** — the office is Asia/Jerusalem; the server is UTC. Several
  functions solve DST by iteration (see `crm-bridge`'s `israelMidnightUtc`).

## Layout of the code

- `src/pages/*` — routes (code-split via `lazyWithReload`). `/tv` is a full-screen
  wall-board outside the Layout.
- `src/services/*` — the Supabase query layer (the frontend's API).
- `src/lib/*` — pure helpers. `agents.js` (roster), `bonus.js`/`dealsBonus.js`
  (pay), `meetingTitle.js` (parsing calendar titles), `dateUtils.js`.
- `src/components/tv/*` — the wall-board's views. It is always dark via a
  `.tv-screen` class that opts out of the light-theme text override (see
  `index.css`, same trick as `.dark-panel`).
- `index.css` — a large hand-maintained `.dark` remap + `.tv-*` keyframes.
- `browser-extension/` — MV3 Chrome extension that autofills BMBY meeting forms
  via the `crm-bridge` edge function.
- `crm-proxy` edge function is a **stub** (`not_wired`) — the "לקוחות" page's Bambi
  CRM integration was never finished.

## Housekeeping backlog

Commit the live DB schema as migrations · add error monitoring (Sentry) ·
Supabase Realtime instead of polling · a single source of truth for the funnel/bonus
math · tests for the pure logic.
