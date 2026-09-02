// The single entry point.
//
// There is no panel any more. Everything the extension shows now lives inside
// BMBY's own layout: the matched meeting beside the lead's details, and one
// control next to the lead's name. Nothing floats over the page, so nothing can
// cover it.

// The access code is a shared, non-secret value, so it is built in rather than
// typed. An agent only has to pick their name, and machines still holding the
// old long token heal themselves on the next load.
const DEFAULT_CODE = '0000'

// Chrome refuses to auto-update an extension that did not come from its store
// ("On Windows and macOS, the update_URL must point to the Chrome Web Store"),
// so an agent can sit on a months-old copy and never know. Silent on any
// failure — being unable to check is not the same as being out of date.
const VERSION_URL = 'https://res-meetings.vercel.app/ext/version.json'
const DOWNLOAD_URL = 'https://res-meetings.vercel.app/ext/RES-BMBY.zip'

/** True when `latest` is newer than `mine`, comparing 1.10.0 > 1.9.0 correctly. */
function isNewer(latest, mine) {
  const a = String(latest).split('.').map(Number)
  const b = String(mine).split('.').map(Number)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || 0
    const y = b[i] || 0
    if (x !== y) return x > y
  }
  return false
}

async function latestVersion() {
  try {
    const res = await fetch(VERSION_URL, { cache: 'no-store' })
    const data = await res.json()
    return typeof data.version === 'string' ? data.version : null
  } catch {
    return null
  }
}

/**
 * Wait, briefly, for the page to prove it is a lead.
 *
 * document_idle only promises the document has parsed — BMBY paints some of
 * these screens afterwards. Deciding at the first instant would answer "not a
 * lead" for a page that becomes one a few hundred milliseconds later, which is
 * the same silent nothing this release exists to remove. Bounded, and the
 * observer disconnects either way, so an ordinary page costs one timeout.
 */
function whenLead(ms = 5000) {
  return new Promise((resolve) => {
    if (RES.isForm || RES.isLead()) return resolve(true)
    let obs = null
    const stop = (found) => {
      if (obs) obs.disconnect()
      clearTimeout(timer)
      resolve(found)
    }
    const timer = setTimeout(() => stop(false), ms)
    obs = new MutationObserver(() => {
      if (RES.isLead()) stop(true)
    })
    obs.observe(document.documentElement, { childList: true, subtree: true })
  })
}

;(async () => {
  const { elc } = RES

  // The manifest now loads this on ALL of www.bmby.com, so that a lead reached
  // from the SALEPHONE dialler — or from any route nobody wrote down — is still
  // recognised. The cost of that reach is that this file also runs on the home
  // page, the search results and every other screen, so the first thing it does
  // is leave the ones it has no business drawing on. Without this, the floating
  // voice button would follow the agent around the whole CRM.
  if (!(await whenLead())) return

  const cfg = await chrome.storage.sync.get(['token', 'agentName'])
  cfg.token = DEFAULT_CODE

  // Before any early return below: dictation needs no login and no agent name,
  // and it is wanted just as much on a form that arrived via hand-off. It mounts
  // only where the description field exists, so calling it here is safe.
  RES.dictate.attach()

  // The voice assistant is OUT for now, at the office's request. command.js is
  // still on disk and still tested — it is simply not listed in the manifest and
  // not started here, so putting it back is two lines rather than a rewrite.

  // On the task form, a hand-off from the lead page fills the form and nothing
  // else is drawn — the agent came here to save one thing, not to browse.
  if (RES.isForm && (await RES.meetings.handoff(cfg))) return

  RES.installStyles()

  if (!cfg.agentName) {
    // Without a name there is nothing to match against. Said once, next to the
    // lead's name, rather than swallowed.
    const name = RES.meetings.headerName()
    if (name) {
      const note = elc('span', 'res-hstatus res-hstatus-bad', 'התוסף לא הוגדר — בחרו שם באפשרויות')
      name.insertAdjacentElement('beforebegin', note)
    }
    return
  }

  RES.meetings.attach({ cfg })

  // Asked after the page is usable, never before.
  //
  // getManifest() returns the version Chrome is RUNNING, not what is on disk.
  // So after update.bat replaces the files, this still reports the old version
  // until the extension is reloaded in chrome://extensions — which is exactly
  // why the notice can seem stuck: the files are new but the running code is
  // not. The notice explains that second step rather than only offering a
  // download, so nobody keeps re-downloading a copy they already have.
  const mine = chrome.runtime?.getManifest?.().version
  latestVersion().then((latest) => {
    if (!latest || !mine || !isNewer(latest, mine)) return
    const controls = document.querySelector('.res-hcontrols') || RES.meetings.headerName()
    if (!controls) return

    const pill = elc('button', 'res-hupdate', `גרסה חדשה ${latest}`)
    pill.type = 'button'
    pill.title = 'איך מעדכנים'

    const note = elc('span', 'res-hupdate-note')
    note.style.display = 'none'
    const step = (n, text) => {
      const row = elc('span', 'res-hupdate-step')
      row.appendChild(elc('span', 'res-hupdate-num', n))
      row.appendChild(elc('span', null, text))
      return row
    }
    note.appendChild(step('1', 'לחצו פעמיים על update.bat בתיקיית התוסף'))
    note.appendChild(step('2', 'ב-chrome://extensions לחצו על ⟳ בכרטיס R.E.S'))
    const dl = elc('a', 'res-hupdate-dl', 'הורדה ידנית של הקובץ')
    dl.href = DOWNLOAD_URL
    dl.target = '_blank'
    note.appendChild(dl)

    pill.onclick = () => {
      note.style.display = note.style.display === 'none' ? '' : 'none'
    }

    if (controls.classList.contains('res-hcontrols')) {
      controls.appendChild(pill)
      controls.appendChild(note)
    } else {
      controls.insertAdjacentElement('beforebegin', note)
      controls.insertAdjacentElement('beforebegin', pill)
    }
  })
})()
