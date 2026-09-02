import { useEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Inbox,
  ClipboardList,
  BarChart3,
  PieChart,
  Users,
  ChevronDown,
  Check,
  X,
  Settings,
  Sparkles,
  Target,
  Sunrise,
  MessageCircle,
  Contact,
  ClipboardCheck,
  BookOpen,
  Megaphone,
  BookOpenCheck,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useUnassigned } from '../context/UnassignedContext'
import { useSettings } from '../context/SettingsContext'
import { countOpenLeads } from '../services/leadsService'
import { isAdminAgent, isManagerAgent, managerViewOnly, pinFor } from '../lib/agents'
import { LogoMark } from './Logo'
import SkyToggle from './SkyToggle'
import PinDialog from './PinDialog'

function initials(name) {
  const p = String(name).trim().split(/\s+/)
  return (p[0]?.[0] || '') + (p[1]?.[0] || '') || '?'
}

/** Vertical nav row on the dark panel: gold active pill, quiet hover. */
/**
 * A shelf label — the word in gold, then a hairline that carries the eye
 * across the panel. First one sits flush; the rest get real air above, so the
 * menu reads as three shelves instead of one pile.
 */
function NavGroupLabel({ children }) {
  return (
    <p className="flex items-center gap-2 px-3 pb-2 pt-1 [&:not(:first-child)]:mt-5">
      <span className="shrink-0 text-[11px] font-extrabold tracking-[0.22em] text-amber-300">
        {children}
      </span>
      <span
        className="h-px flex-1 rounded-full bg-gradient-to-l from-amber-400/50 via-amber-400/20 to-transparent"
        aria-hidden="true"
      />
    </p>
  )
}

function SideNavLink({ to, icon: Icon, label, badge = 0, badgeColor = 'bg-amber-500', onNavigate }) {
  return (
    <NavLink
      to={to}
      end
      onClick={onNavigate}
      className={({ isActive }) =>
        `group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200 ${
          isActive
            ? 'bg-gradient-to-l from-amber-500 to-yellow-400 text-slate-900 shadow-lg shadow-amber-500/25'
            : 'text-slate-100/80 hover:bg-white/10 hover:text-white'
        }`
      }
    >
      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
      <span className="flex-1">{label}</span>
      {badge > 0 && (
        <span
          className={`inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[11px] font-bold text-white ${badgeColor} animate-pop`}
        >
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </NavLink>
  )
}

/** Chunky solid action button for the footer (Clients / WhatsApp). */
function FooterAction({ to, icon: Icon, label, tone, onNavigate }) {
  const tones = {
    gold: {
      base: 'bg-gradient-to-l from-amber-500 to-yellow-400 text-slate-900 shadow-amber-500/25',
      ring: 'ring-amber-300/70',
    },
    green: {
      base: 'bg-gradient-to-l from-green-500 to-emerald-500 text-white shadow-green-900/30',
      ring: 'ring-green-300/70',
    },
    // Deliberately the quiet one. Management sits beside two buttons the team
    // presses all day; it should be reachable, not competing with them.
    grey: {
      base: 'bg-gradient-to-l from-slate-600 to-slate-700 text-white shadow-slate-900/40',
      ring: 'ring-slate-400/70',
    },
  }
  const t = tones[tone] || tones.gold
  return (
    <NavLink
      to={to}
      end
      onClick={onNavigate}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-xl px-4 py-3.5 text-sm font-bold shadow-lg transition-all duration-200 active:scale-95 ${
          t.base
        } ${isActive ? `ring-2 ${t.ring}` : 'hover:brightness-105'}`
      }
    >
      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
      <span className="flex-1">{label}</span>
    </NavLink>
  )
}

/**
 * The one nav item that is ALWAYS gold — ספיץ, the call script. Every other
 * entry earns gold only while active; this one is the stage door, and the user
 * asked for it to outshine the rest of the menu. Active state adds a ring so
 * "you are here" still reads.
 */
function SpeechNavLink({ onNavigate }) {
  return (
    <NavLink
      to="/speech"
      end
      onClick={onNavigate}
      className={({ isActive }) =>
        `group relative flex items-center gap-3 overflow-hidden rounded-xl bg-gradient-to-l from-amber-500 via-yellow-400 to-amber-400 px-3 py-3 text-sm font-extrabold text-slate-900 shadow-lg shadow-amber-500/30 transition-all duration-200 hover:brightness-105 active:scale-[0.98] ${
          isActive ? 'ring-2 ring-amber-200' : ''
        }`
      }
    >
      {/* A soft sheen so it reads "stage", not "just another active tab" */}
      <span
        className="pointer-events-none absolute -inset-y-4 -start-8 w-16 rotate-12 bg-white/25 blur-md"
        aria-hidden="true"
      />
      <Megaphone className="h-5 w-5 shrink-0" aria-hidden="true" />
      <span className="flex-1">ספיץ</span>
      <span className="rounded-full bg-slate-900/90 px-2 py-0.5 text-[9px] font-black tracking-[0.15em] text-amber-300">
        LIVE
      </span>
    </NavLink>
  )
}

// NOTE: a standalone NotificationsBell used to live here for the mobile top
// bar. It was removed with the bell itself — unread messages are still counted
// on the "הודעות" nav item below, so nothing about them became invisible.

/** Agent picker at the bottom of the sidebar — its dropdown opens upward. */
function AgentSwitcher() {
  const { agents, selectedAgent, setSelectedAgent, unlockAgent, isUnlocked } = useAuth()
  const [open, setOpen] = useState(false)
  const [askPin, setAskPin] = useState(null) // the name being unlocked
  const ref = useRef(null)

  // Switch agent → persist choice, then hard-reload to the home page so the
  // whole app refreshes with the new agent's data.
  const enter = (name) => {
    setSelectedAgent(name)
    window.location.assign('/')
  }

  // A code is asked only where the ניהול page set one, and only until this
  // device has answered it once.
  const pick = (name) => {
    setOpen(false)
    if (name === selectedAgent) return
    if (isUnlocked(name)) enter(name)
    else setAskPin(name)
  }

  useEffect(() => {
    if (!open) return
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-2.5 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-yellow-600 text-[11px] font-bold text-slate-900 ring-1 ring-white/30">
          {initials(selectedAgent)}
        </span>
        <span className="flex-1 truncate text-start">{selectedAgent}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-100/60 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        // White popover inside the dark panel — slash-opacity colour utilities
        // keep it readable (they escape both global text overrides).
        // Opens downward: the picker sits at the top of the panel.
        <div className="absolute inset-x-0 top-full z-30 mt-2 max-h-72 origin-top overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl animate-scale-in">
          <div className="border-b border-slate-100 px-3 py-2 text-xs font-semibold text-slate-500/90 dark:text-slate-300">
            החלפת סוכן
          </div>
          {agents.map((name) => {
            const active = name === selectedAgent
            return (
              <button
                key={name}
                onClick={() => pick(name)}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2.5 text-right text-sm transition ${
                  active
                    ? 'bg-slate-900 font-semibold text-white'
                    : // Slash-opacity escapes the light theme's overrides, so night
                      // mode needs its own explicit white — the popover bg goes
                      // dark but this text would otherwise stay near-black.
                      'text-slate-800/95 hover:bg-slate-100 dark:text-white'
                }`}
              >
                <span className="truncate">{name}</span>
                {active && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
              </button>
            )
          })}
        </div>
      )}

      {askPin && (
        <PinDialog
          pin={pinFor(askPin)}
          title={askPin}
          onSuccess={() => {
            unlockAgent(askPin)
            enter(askPin)
          }}
          onCancel={() => setAskPin(null)}
        />
      )}
    </div>
  )
}

/**
 * Right-side navigation (RTL start). Persistent on desktop; a slide-in drawer on
 * mobile, controlled by `open` / `onClose`.
 */
export default function Sidebar({ open, onClose, dark, onTheme }) {
  const { selectedAgent } = useAuth()
  const { count: unassigned } = useUnassigned()
  const { isHidden } = useSettings()
  // Two different questions. `viewAll` is "has no meetings of their own,
  // so show everyone's" — true for איציק, false for ויטלי, who manages AND
  // sells and must keep his own calendar, tasks and day summary.
  // `canSeeAll` is "allowed to look at everyone's numbers", true for both.
  // Leads waiting for whoever is signed in — the number on the menu. Polled on
  // the same slow cadence as the rest; a lead is urgent, but not so urgent that
  // every tab should ask twice a minute.
  const [openLeads, setOpenLeads] = useState(0)
  useEffect(() => {
    let alive = true
    const scope = isManagerAgent(selectedAgent) || isAdminAgent(selectedAgent) ? null : selectedAgent
    const read = () =>
      countOpenLeads(scope)
        .then((n) => alive && setOpenLeads(n))
        .catch(() => {})
    read()
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') read()
    }, 60_000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [selectedAgent])

  const viewAll = managerViewOnly(selectedAgent)
  const canSeeAll = isManagerAgent(selectedAgent)
  const canControl = isAdminAgent(selectedAgent)
  const close = () => onClose?.()

  return (
    <>
      {/* Backdrop (mobile only) */}
      {open && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm sm:hidden"
          aria-hidden="true"
        />
      )}

      <aside
        className={`dark-panel fixed inset-y-0 start-0 z-50 flex w-64 flex-col border-e border-white/10 bg-gradient-to-b from-slate-900 via-slate-950 to-black shadow-2xl transition-transform duration-300 ${
          open ? 'translate-x-0' : 'translate-x-full'
        } sm:translate-x-0`}
      >
        {/* Soft gold aura at the top of the panel */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-amber-400/10 to-transparent"
          aria-hidden="true"
        />

        {/* Brand. Management used to hide behind a click on this mark; it is a
            page in the menu now, so the logo is only a logo again. */}
        {/* Same status-bar inset as the mobile header: the drawer is fixed to
            the top edge, so its brand row would sit under the clock too. */}
        <div className="relative flex items-center gap-2.5 border-b border-white/10 px-4 pb-4 pt-[calc(1rem+env(safe-area-inset-top))]">
          <LogoMark className="h-9 w-9" />
          <span className="leading-none">
            <span className="block text-base font-extrabold tracking-tight text-white">
              מכללת{' '}
              <span className="bg-gradient-to-l from-amber-500 via-amber-300 to-yellow-200 bg-clip-text text-transparent">
                RES
              </span>
            </span>
            <span className="mt-1 block text-[10px] font-semibold tracking-[0.18em] text-amber-400/80">
              מערכת <span className="tracking-normal">CRM</span>
            </span>
          </span>
          {/* Day/night, at the far (left) end of the brand row — desktop only.
              The phone keeps its toggle in the top header instead, so the
              drawer's copy of this row stays clean. */}
          <span className="ms-auto hidden sm:block">
            <SkyToggle dark={dark} onChange={onTheme} />
          </span>
          <button
            onClick={onClose}
            className="ms-auto rounded-xl p-2 text-slate-100/70 transition hover:bg-white/10 hover:text-white sm:hidden"
            aria-label="סגירת התפריט"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Agent picker sits above the menu */}
        <div className="relative border-b border-white/10 p-3">
          <AgentSwitcher />
        </div>

        {/* Nav — grouped by what the person is DOING, so every page has a
            home: the work itself, then reporting on it, then the helpers.
            One flat list read as pages thrown in a drawer; three labelled
            shelves read as a system. A group whose every page is hidden (or
            out of role) drops its label too — no empty shelves. */}
        <nav className="relative flex-1 space-y-1 overflow-y-auto p-3">
          <NavGroupLabel>העבודה שלי</NavGroupLabel>
          {/* The calendar IS the home page, so it leads the shelf. */}
          <SideNavLink
            to="/"
            icon={LayoutDashboard}
            label={viewAll ? 'הפגישות של כולם' : 'הפגישות שלי'}
            onNavigate={close}
          />
          {!isHidden('today') && (
            <SideNavLink to="/today" icon={Sunrise} label="היום שלי" onNavigate={close} />
          )}
          {!isHidden('speech') && <SpeechNavLink onNavigate={close} />}
          {!isHidden('leads') && (
            <SideNavLink
              to="/leads"
              icon={Target}
              label="לידים"
              badge={openLeads}
              badgeColor="bg-red-500"
              onNavigate={close}
            />
          )}
          {!viewAll && !isHidden('claim-yard') && (
            <SideNavLink
              to="/claim-yard"
              icon={Inbox}
              label="פגישות אבודות"
              badge={unassigned}
              onNavigate={close}
            />
          )}
          {!viewAll && !isHidden('tasks') && (
            <SideNavLink to="/tasks" icon={ClipboardList} label="משימות" onNavigate={close} />
          )}

          {((!viewAll && !isHidden('day-summary')) ||
            (canSeeAll && !isHidden('agents-daily')) ||
            !isHidden('reports')) && <NavGroupLabel>דיווח וניתוח</NavGroupLabel>}
          {!viewAll && !isHidden('day-summary') && (
            <SideNavLink
              to="/day-summary"
              icon={ClipboardCheck}
              label="סיכום יום"
              onNavigate={close}
            />
          )}
          {canSeeAll && !isHidden('agents-daily') && (
            <SideNavLink
              to="/agents-daily"
              icon={BarChart3}
              label="נתונים יומיים"
              onNavigate={close}
            />
          )}
          {!isHidden('reports') && (
            <SideNavLink to="/reports" icon={PieChart} label="דוחות" onNavigate={close} />
          )}

          {(!isHidden('assistant') || !isHidden('objections') || !isHidden('info')) && (
            <NavGroupLabel>עזרים</NavGroupLabel>
          )}
          {!isHidden('objections') && (
            <SideNavLink
              to="/objections"
              icon={BookOpenCheck}
              label="ספריית התנגדויות"
              onNavigate={close}
            />
          )}
          {!isHidden('assistant') && (
            <SideNavLink to="/assistant" icon={Sparkles} label="עוזר AI" onNavigate={close} />
          )}
          {!isHidden('info') && (
            <SideNavLink to="/info" icon={BookOpen} label="מידע שימושי" onNavigate={close} />
          )}
        </nav>

        {/* Footer: clients + whatsapp actions. Clears the iPhone home indicator
            so the last button isn't half-swallowed by it. */}
        <div className="relative space-y-2 border-t border-white/10 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          {!isHidden('clients') && (
            <FooterAction to="/clients" icon={Contact} label="לקוחות" tone="gold" onNavigate={close} />
          )}
          {canControl && (
            <FooterAction to="/manage" icon={Settings} label="ניהול" tone="grey" onNavigate={close} />
          )}
          {!isHidden('whatsapp') && (
            <FooterAction to="/whatsapp" icon={MessageCircle} label="ווצאפ" tone="green" onNavigate={close} />
          )}
        </div>
      </aside>

    </>
  )
}
