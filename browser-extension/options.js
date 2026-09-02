// Settings for the BMBY filler: which agent this machine belongs to.
//
// The access code used to be a long secret each agent pasted in. It is now a
// shared, non-secret value that fills itself — so all that is really being set
// here is the name. The code field stays visible (pre-filled) so it is clear
// what is happening and so it could be changed centrally later if ever needed.
// Both live in chrome.storage.sync — never in the page, never in BMBY.

const DEFAULT_CODE = '0000'

const agentEl = document.getElementById('agent')
const tokenEl = document.getElementById('token')
const msgEl = document.getElementById('msg')

chrome.storage.sync.get(['token', 'agentName']).then((cfg) => {
  if (cfg.agentName) agentEl.value = cfg.agentName
  // Always the simple code, not whatever an old install happens to have stored —
  // otherwise a machine upgrading from the long-token version would show the
  // long token here and look broken.
  tokenEl.value = DEFAULT_CODE
})

function say(text, ok) {
  msgEl.textContent = text
  msgEl.className = 'msg ' + (ok ? 'ok' : 'bad')
}

document.getElementById('save').addEventListener('click', async () => {
  const agentName = agentEl.value.trim()
  const token = tokenEl.value.trim() || DEFAULT_CODE

  if (!agentName) return say('בחרו שם סוכן.', false)

  // Verified before saving, so a problem is caught here and not later, in the
  // middle of a booking, as an unexplained empty panel.
  say('בודק…', true)
  try {
    const res = await fetch(
      'https://uhmzdhtjabhbcyslovfk.supabase.co/functions/v1/crm-bridge',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-bridge-token': token },
        body: JSON.stringify({ agentName }),
      }
    )
    const data = await res.json()
    if (!data.ok) {
      return say(data.error === 'unauthorized' ? 'קוד הגישה שגוי.' : 'הבדיקה נכשלה.', false)
    }
    await chrome.storage.sync.set({ agentName, token })
    say(`נשמר. נמצאו ${data.meetings.length} פגישות עבור ${agentName}.`, true)
  } catch {
    say('אין חיבור לשרת. בדקו אינטרנט ונסו שוב.', false)
  }
})
