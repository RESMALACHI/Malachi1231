# מערכת מעקב פגישות · Meeting Tracker

אפליקציית ווב מלאה (Full-Stack) למעקב ודיווח על פגישות סוכנים. הממשק כולו בעברית עם
תמיכה מלאה ב-RTL.

A Hebrew, RTL meeting tracking & reporting web app. Agents sign in with Google, sync
their Google Calendar into the app, mark each meeting's attendance and location type, and
view KPI reports. Admins see a cross-agent summary.

## Tech Stack
- **Frontend:** React (Vite), Tailwind CSS, `lucide-react`, React Router
- **Backend:** Supabase (Auth + Postgres)
- **Integration:** Google Calendar REST API (token from Supabase Google OAuth)

## Features
- 🔐 **Login** — single "Sign in with Google" via Supabase Auth (requests the
  `calendar.readonly` scope).
- 👤 **Agent dashboard** (`ממשק סוכן`) — greeting + prominent **סנכרן יומן** button, a
  month/year filter, and the month's meetings. Each meeting has two toggle groups:
  - נוכחות: **הגיע / לא הגיע / טרם עודכן**
  - סוג פגישה: **זום / פרונטלי**
- 📊 **Reports** (`דוחות וסטטיסטיקות`) — KPI cards: total meetings, attendance %,
  Zoom-vs-Frontal split, plus a status breakdown.
- 🛡️ **Admin dashboard** (`ממשק מנהל`) — visible only to `role = 'admin'`; lists all agents
  with their monthly metrics.
- 🔄 **Calendar sync** — fetches the month's events, **inserts only new ones** (existing
  `google_event_id`s are preserved so manual edits are never overwritten), and
  **auto-detects** Zoom vs in-person from the event's location/description/conference data.

## Project structure
```
meeting-tracker/
├─ supabase/migrations/0001_init.sql   # tables, RLS, signup trigger
├─ src/
│  ├─ lib/            supabaseClient · googleCalendar · dateUtils
│  ├─ context/        AuthContext (session, profile/role, Google token)
│  ├─ services/       meetingsService (CRUD + KPIs) · syncService (sync logic)
│  ├─ components/     Header, Layout, MonthFilter, ToggleGroup, MeetingsTable,
│  │                  MeetingRow, KpiCard, Spinner, EmptyState, ProtectedRoute
│  └─ pages/          LoginPage · AgentDashboard · ReportsPage · AdminDashboard
└─ ...config (vite, tailwind, postcss, .env.example)
```

## Getting started

### 1. Install
```bash
cd meeting-tracker
npm install
```

### 2. Supabase
1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run the migrations in order:
   `0001_init.sql` → `0002_meetings_delete_policy.sql` → `0003_google_tokens.sql` →
   `0004_agents_and_details.sql` (all under `supabase/migrations/`, idempotent).
3. Grab **Project URL** and **anon public key** from *Project Settings → API*.

### 3. Google OAuth (for login + Calendar)
1. In **Google Cloud Console**: enable the **Google Calendar API**, then create an
   **OAuth 2.0 Client ID** (Web application).
2. Add the authorized redirect URI:
   `https://<your-project-ref>.supabase.co/auth/v1/callback`
3. In **Supabase → Authentication → Providers → Google**: enable it, paste the client ID
   and secret. The app requests the `https://www.googleapis.com/auth/calendar.readonly`
   scope at sign-in.

### 4. Environment
```bash
cp .env.example .env
# then edit .env:
#   VITE_SUPABASE_URL=...
#   VITE_SUPABASE_ANON_KEY=...
```

### 5. Run
```bash
npm run dev      # http://localhost:5173
npm run build    # production build
```

### 6. Make yourself an admin
After your first login, in the Supabase SQL editor:
```sql
update public.profiles set role = 'admin' where id = '<your-user-uuid>';
```
(Find your UUID under *Authentication → Users*.) Reload to see the **ניהול** tab.

## How the sync works
`src/services/syncService.js`:
1. Builds an ISO `timeMin`/`timeMax` for the selected month.
2. `GET /calendar/v3/calendars/primary/events` with the Google access token
   (`session.provider_token`).
3. **Per-agent filter** — only events whose text (title / description / location /
   attendees) contains the **selected agent's name** are imported, and they're stored
   with that `agent_name`. Switch agents from the header ("החלפת סוכן"); the agent list
   is in `src/lib/agents.js`.
4. Auto-detects type — any `zoom` / `zoom.us` mention in location, description, or
   conference data → `zoom`, otherwise `frontal`.
5. **Inserts** new events (`upsert` with `ignoreDuplicates`) with default `pending` status.
6. **Updates** the title/time of events that changed in Google, while **keeping** the
   agent's manual status and type.
7. **Mirrors deletions** — any meeting in the DB for that month that came from Google but
   is no longer in the calendar is **deleted** from the app (this discards its manual
   status/type, since the event no longer exists). Manual entries (no `google_event_id`)
   are never touched.

### Near-real-time auto-sync
The agent dashboard auto-syncs the selected month: on open, every 60s while the tab is
visible, and whenever the tab regains focus — so renamed/moved/deleted calendar events
show up without pressing **סנכרן יומן**. A status line shows the last sync time.

> This is polling, not push. Truly instant propagation from Google needs a backend
> webhook (`events.watch` → a server/Edge Function), which is out of scope for this
> frontend-only app. The 60s interval can be tuned via `AUTO_SYNC_MS` in
> `src/pages/AgentDashboard.jsx`.

## Stay connected — sign in once (no repeated re-login)

Google access tokens expire after ~1 hour and Supabase can't refresh them in the browser,
so by default the user must occasionally click **התחבר מחדש**. To remove that entirely,
deploy the included **Edge Function** that refreshes tokens server-side from the stored
refresh token.

How it works: on sign-in the app saves Google's `provider_refresh_token` into
`user_google_tokens` (RLS blocks reading it back). The `google-access-token` function
reads it with the service role and exchanges it for a fresh access token on demand. The
frontend ([`src/lib/googleToken.js`](src/lib/googleToken.js)) calls the function and caches
the token, so calendar sync keeps working indefinitely after a single sign-in.

One-time setup:
```bash
# 1. Run the new migration (adds user_google_tokens + RLS)
#    supabase/migrations/0003_google_tokens.sql   (via SQL editor or db push)

# 2. From the project root, with the Supabase CLI:
supabase login
supabase link --project-ref uhmzdhtjabhbcyslovfk

# 3. Give the function your Google OAuth credentials (server-side secrets):
supabase secrets set GOOGLE_CLIENT_ID=<your-client-id> GOOGLE_CLIENT_SECRET=<your-client-secret>

# 4. Deploy
supabase functions deploy google-access-token
```
After deploying, sign in once **with the Google consent screen** (so a refresh token is
issued) — from then on no reconnect is needed. If a user revokes access in their Google
account, the function returns `invalid_grant` and the app falls back to the reconnect prompt.

> Without this function the app still works, but falls back to the short-lived session
> token and the occasional **התחבר מחדש** prompt.

## Database schema (summary)
- **profiles**: `id` (→ `auth.users`), `full_name`, `role` (`agent` | `admin`).
- **meetings**: `id`, `agent_id` (→ `profiles`), `google_event_id` (unique), `title`,
  `meeting_date`, `status` (`pending` | `attended` | `no_show`), `type` (`zoom` |
  `frontal`).
- **user_google_tokens**: `user_id` (→ `auth.users`), `refresh_token`. RLS allows the
  owner to write but **never read it back**; the Edge Function reads it via the service role.
- **RLS**: agents see/modify only their own meetings; admins can read all. A trigger
  auto-creates a profile on signup.
