// Turn a raw calendar DESCRIPTION into the clean note that was actually typed —
// stripping the auto-added Google Meet block, stray HTML like <br>, and entities.

// Phrases Google (and others) append automatically. We cut from the earliest one
// to the end of the text.
const CUT_MARKERS = [
  '-::~:~', // Google's tilde separator line before the Meet block
  '־::~:~',
  'join with google meet',
  'הצטרפות באמצעות google meet',
  'הצטרפות ב-google meet',
  'über google meet',
  'meet.google.com',
  'weitere informationen zu meet',
  'learn more about meet',
  'מידע נוסף על meet',
  'support.google.com/a/users/answer',
]

export function cleanDescription(raw) {
  if (!raw) return ''
  let s = String(raw)

  // 1. Cut the auto-appended conferencing block (earliest marker wins).
  const lower = s.toLowerCase()
  let cut = s.length
  for (const mk of CUT_MARKERS) {
    const i = lower.indexOf(mk)
    if (i !== -1 && i < cut) cut = i
  }
  s = s.slice(0, cut)

  // 2. Line-level tags → line break, then drop every remaining tag. <p> matters
  //    as much as <br>: Google wraps each pasted line in <p>…</p>, and without
  //    this they collapse into one run-on line ("שירן נעים0587…מנתניה…"). Only
  //    the CLOSING tag makes the break — turning both <p> and </p> into newlines
  //    would double every line and leave a blank between all of them.
  s = s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')

  // 3. Decode the common HTML entities.
  s = s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")

  // 4. Tidy whitespace.
  return s
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
