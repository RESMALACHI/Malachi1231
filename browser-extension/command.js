// Voice assistant — a button on the lead page, Alt+K anywhere.
//
// Say "קבע פגישה פרונטלית מחר בארבע וחצי" and the whole task form is filled in
// one sentence, instead of a date picker plus four dropdowns.
//
// It works on BOTH pages the extension runs on, and does the sensible thing for
// each: on the task form it fills the fields directly; on the lead page there
// are no fields to fill, so it opens the task form ALREADY filled — riding the
// same hand-off the meeting card already uses.
//
// TWO RULES THIS FILE KEEPS:
//
//   1. It NEVER submits. Speech recognition mishears, and a wrong meeting saved
//      silently is worse than no feature. Everything heard is shown as a preview
//      the agent confirms — and אישור stays theirs to press, as always.
//
//   2. It fills through the same helpers meetings.js uses, so the hidden date
//      companion and the five-minute snapping stay correct in one place.

RES.command = (() => {
  const { FIELD, elc, setText, setSelect, setHidden, bmbyDate, isoDate, snapMinute } = RES

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition

  const WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

  // Spoken hours. People say "בארבע", never "בשעה 16".
  const HOUR_WORD = {
    'אחת': 1, 'אחד': 1,
    'שתיים': 2, 'שתים': 2, 'שניים': 2,
    'שלוש': 3, 'שלושה': 3,
    'ארבע': 4, 'ארבעה': 4,
    'חמש': 5, 'חמישה': 5,
    'שש': 6, 'שישה': 6,
    'שבע': 7, 'שבעה': 7,
    'שמונה': 8,
    'תשע': 9, 'תשעה': 9,
    'עשר': 10, 'עשרה': 10,
    'אחת עשרה': 11, 'אחד עשרה': 11,
    'שתים עשרה': 12, 'שתיים עשרה': 12,
  }

  /** Counting words, for "בעוד שלושה ימים" / "בעוד ארבע שעות". */
  const COUNT_WORD = {
    'יום': 1, 'יומיים': 2, 'שעה': 1, 'שעתיים': 2,
    'שלושה': 3, 'שלוש': 3, 'ארבעה': 4, 'ארבע': 4, 'חמישה': 5, 'חמש': 5,
    'שישה': 6, 'שש': 6, 'שבעה': 7, 'שבע': 7, 'שמונה': 8,
    'תשעה': 9, 'תשע': 9, 'עשרה': 10, 'עשר': 10,
  }

  // Hebrew has no \b that works, and single letters (ל, ב, ו, ה, מ, ש, כ) glue
  // onto the front of words — so "למחר", "ומחר" and "מחר" are the same word and
  // must all match, while "אמחר" (were it a word) must not.
  const HEB = 'א-ת'
  const W = (body) => new RegExp(`(?<![${HEB}])[לובהמשכ]?(?:${body})(?![${HEB}])`, 'u')
  const has = (t, body) => W(body).test(t)

  /**
   * Time of day, when that is ALL the agent said. "מחר בבוקר" has to mean
   * something rather than nothing — these are the middle of each window, taken
   * from when the 2,251 real meetings actually sit.
   */
  // ORDER MATTERS: "אחרי הצהריים" contains "צהריים", so the longer phrase has
  // to be tested first or every afternoon becomes 13:00.
  const DAYPART = [
    { re: 'אחר[יי]? ?ה?צהר[יי]ים', h: 16 },
    { re: 'בוקר', h: 10 },
    { re: 'צהר[יי]ים', h: 13 },
    { re: 'ערב', h: 19 },
  ]

  /**
   * How long, in minutes. BMBY defaults to an hour and so does this — but a
   * viewing really is half an hour and a first meeting really can run two, and
   * an end time that is quietly wrong is a double booking waiting to happen.
   *
   * Most specific first: "שעה וחצי" contains "שעה", and "שעתיים וחצי" contains
   * "שעתיים".
   */
  const DURATION = [
    [/(?:ל|של|כ)?\s*שעתיים\s*וחצי/u, 150],
    [/(?:ל|של|כ)?\s*שעה\s*וחצי/u, 90],
    [/(?:ל|של|כ)?\s*חצי\s*שעה/u, 30],
    [/(?:ל|של|כ)?\s*רבע\s*שעה/u, 15],
    [/(?:ל|של|כ)?\s*שעתיים/u, 120],
    // The digit form insists on a preposition, so that "בעוד 45 דקות" — which
    // is a time, not a length — can never be read as one.
    [/(?:ל|של|כ)[\s-]*(\d{1,3})\s*דקות/u, null],
  ]

  /**
   * Minutes past (and to) the hour, as people say them.
   *
   * Negative means "to": "רבע לארבע" arrives as 4 with −15 and is rolled back
   * into 15:45 once the hour is known.
   */
  const MINUTES = [
    [/ועשרים\s*וחמ(?:ש|ישה)/u, 25],
    [/פחות\s*עשרים/u, -20],
    [/פחות\s*רבע/u, -15],
    [/פחות\s*עשרה?/u, -10],
    [/פחות\s*חמ(?:ש|ישה)/u, -5],
    [/רבע\s*ל(?=[א-ת])/u, -15],
    [/וחצי/u, 30],
    [/ורבע/u, 15],
    [/ועשרים/u, 20],
    [/ועשרה/u, 10],
    [/וחמ(?:ש|ישה)(?![א-ת])/u, 5],
  ]

  /** "יום ו" — people abbreviate to the letter, and only after "יום". */
  const DAY_LETTER = { 'א': 0, 'ב': 1, 'ג': 2, 'ד': 3, 'ה': 4, 'ו': 5 }

  /** "ב-12 באוגוסט" — a date far enough out that nobody says "בעוד". */
  const MONTH = {
    'ינואר': 0, 'פברואר': 1, 'מרץ': 2, 'מרס': 2, 'אפריל': 3, 'מאי': 4,
    'יוני': 5, 'יולי': 6, 'אוגוסט': 7, 'ספטמבר': 8, 'אוקטובר': 9,
    'נובמבר': 10, 'דצמבר': 11,
  }

  // ── What the agent is asking for ───────────────────────────────────────────
  //
  // Four things can be asked for, and the words for them overlap heavily,
  // because people talk that way:
  //
  //   "תבדוק אם יש לו פגישה"      contains פגישה, but it is a LOOKUP
  //   "תרשום שיש לו פגישה מחר"    contains פגישה AND מחר, but it is a NOTE
  //   "תיצור משימה למחר"          contains a date, but it is a TASK
  //   "תרשום אותו לפגישה מחר"     starts with תרשום, but it is a MEETING
  //
  // Testing "is there a date" first — which is all this used to do — turned
  // every one of those into a client appointment.
  //
  // The rule that sorts them out is simply WHICH COMMAND WORD CAME FIRST. In
  // "תזכיר לי לעדכן אותו" the request is the reminder and the update is its
  // subject; in "תעדכן שביקש שנזכיר לו" it is the other way round. Position
  // says which, and nothing else has to.
  const NOTE_V =
    'תרשום|תרשמי|תרשם|רשום|רשמי|לרשום|תכתוב|תכתבי|תכתב|כתוב|כתבי|לכתוב|' +
    'תעדכן|תעדכני|עדכן|עדכני|לעדכן|תציין|תצייני|ציין|לציין|תתעד|לתעד|' +
    'תסמן|לסמן|תשאיר\\s*הערה|תוסיף\\s*הערה|להוסיף\\s*הערה|בהערות|הערה'

  const TASK_V =
    'תזכיר\\s*ל?י|תזכירי\\s*לי|תזכורת|להזכיר|תזכור|לזכור|' +
    'משימה|משימות|צור\\s*משימה|תיצור\\s*משימה|תפתח\\s*משימה|לפתוח\\s*משימה|' +
    'שים\\s*לי|תשים\\s*לי|פולו?\\s*אפ|follow\\s*up|מעקב|תעקוב|לעקוב|' +
    'תחזור\\s*אליו|תחזרי\\s*אליו|לחזור\\s*אליו|תתקשר|להתקשר|תתקשרי'

  const FIND_V =
    'תבדוק|תבדקי|לבדוק|תמצא|למצוא|תראה\\s*אם|תראה\\s*לי|תציג|להציג|' +
    'יש\\s*לו\\s*פגישה|האם\\s*יש|מתי\\s*ה?פגישה|איזה\\s*פגיש|כמה\\s*פגיש|' +
    'מה\\s*ה?סטטוס|מה\\s*קורה\\s*איתו|מה\\s*יש\\s*לו|חפש|תחפש|תרענן|רענן'

  const MEET_V =
    'פגיש|תקבע|תקבעי|תיקבע|קבע|קבעי|לקבוע|תזמן|תזמני|לזמן|' +
    'ניפגש|נפגש|להיפגש|נראה\\s*אותו|לראות\\s*אותו|תשים\\s*לו|נשים\\s*אותו|' +
    'תקפיץ|יגיע|תדחה|לדחות|נדחה|תזיז|להזיז|תעביר\\s*את\\s*ה?פגישה|' +
    'סיור|ביקור\\s*בפרויקט'

  const VERB = [
    ['note', new RegExp(NOTE_V, 'u')],
    ['task', new RegExp(TASK_V, 'u')],
    ['find', new RegExp(FIND_V, 'u')],
    ['meeting', new RegExp(MEET_V, 'u')],
  ]

  /**
   * "תרשום אותו לפגישה מחר" — a note verb, and yet plainly a booking.
   *
   * This one phrasing is common enough to be worth a rule of its own, because
   * the alternative is a note that says "אותו לפגישה מחר" and no meeting at
   * all. It only fires when a meeting word follows almost immediately, so
   * "תרשום שיש לו פגישה" is untouched.
   */
  const BOOK_NOTE =
    /(?:תרשום|תרשמי|רשום|תכניס|להכניס|תשבץ|לשבץ|תוסיף)\s*(?:לו|לה|להם|אותו|אותה|אותם|ללקוח)?\s*ל?(?:פגיש|סיור)/u

  /** The words that introduce a note — stripped off so the note reads as a note. */
  const NOTE_LEAD = new RegExp(`(?:${NOTE_V})\\s*`, 'u')

  /** Politeness and plumbing between the command word and the actual note. */
  const NOTE_FILLER =
    /^(?:לו|לה|להם|להן|אותו|אותה|אותם|ללקוח|לליד|לי|בבקשה|בהערות|בהערה|הערה|כאן|פה)\s+/u

  /**
   * Real words that merely start with ש. Without this list, stripping the "ש"
   * of "שהוא" would also butcher "של", "שבוע" and "שכירות".
   *
   * The end guard is not optional: without it "שלא ענה" matches "של" and keeps
   * a ש that means "that", so the note reads "שלא ענה" instead of "לא ענה".
   */
  const SHIN_WORDS = new RegExp(
    '^(?:' +
      [
        // grammar
        'של', 'שלו', 'שלה', 'שלי', 'שלנו', 'שלכם', 'שלהם', 'שם', 'שמו', 'שמה',
        'שוב', 'שום', 'שניהם', 'שנינו',
        // time
        'שעה', 'שעות', 'שעתיים', 'שבוע', 'שבועיים', 'שבועות', 'שבת', 'שנה',
        'שנים', 'שנתיים', 'שעבר', 'שניה', 'שנייה',
        // days and numbers
        'שני', 'שלישי', 'שישי', 'שמונה', 'שלוש', 'שלושה', 'שבע', 'שבעה', 'שש',
        'שישה', 'שמונים', 'שלושים', 'שבעים', 'שישים',
        // greetings and speech
        'שלום', 'שיחה', 'שאלה', 'שאל', 'שאלתי', 'שמעתי', 'שמח', 'שולח', 'שלח',
        'שלחתי', 'שלחה',
        // the trade — these are the ones a property note is actually made of
        'שכירות', 'שכר', 'שכונה', 'שיפוץ', 'שטח', 'שווה', 'שווי', 'שמאי',
        'שוקל', 'שוקלת', 'שילם', 'שילמה', 'שקל', 'שקלים', 'שירות', 'שינוי',
        'שלב', 'שלבים', 'שותף', 'שותפה', 'שכן', 'שכנים', 'שדרוג', 'שיווק',
      ].join('|') +
      `)(?![${HEB}])`,
    'u'
  )

  /**
   * "תרשום שהוא לא ענה" → "הוא לא ענה".
   *
   * The command word goes, then the filler ("לו", "בהערות"), and only then the
   * "ש" that means "that" — in that order, because "תרשום לו שהוא ביקש" hides
   * its ש behind the pronoun, and stripping the ש first would never reach it.
   */
  function noteText(t) {
    const m = t.match(NOTE_LEAD)
    if (!m) return null
    let rest = t.slice(m.index + m[0].length).trim()

    // "תרשום לו בהערות ש..." stacks two of them, so this repeats rather than
    // stripping once. Bounded, so a strange sentence cannot spin here.
    for (let i = 0; i < 4 && NOTE_FILLER.test(rest); i++) {
      rest = rest.replace(NOTE_FILLER, '').trim()
    }

    if (/^ש/u.test(rest) && !SHIN_WORDS.test(rest)) rest = rest.slice(1).trim()
    return rest.length >= 2 ? rest : null
  }

  /** Which of the four — whichever command word was said FIRST. */
  function detectAction(t) {
    if (BOOK_NOTE.test(t)) return 'meeting'
    let best = null
    for (const [name, re] of VERB) {
      const at = t.search(re)
      if (at < 0) continue
      // Strictly earlier, so a tie is settled by the order above — where the
      // explicit verbs (note, task) sit ahead of the loose ones.
      if (best === null || at < best.at) best = { name, at }
    }
    return best && best.name
  }

  const clean = (s) =>
    String(s || '')
      .replace(/[‎‏⁦-⁩]/g, '')
      .replace(/\s+/g, ' ')
      .trim()

  const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

  /**
   * A spoken sentence → what to put in the form.
   *
   * Pure, and `now` is injected rather than read from the clock, so the same
   * sentence always parses the same way in a test.
   */
  function parse(raw, now = new Date()) {
    const t = clean(raw)
    const out = {
      action: null, date: null, time: null, dur: null, kind: null, note: null, raw: t,
    }
    if (!t) return out

    // ── type ──
    // The agent will not say "פרונטלית" every time. "אצלנו", "במשרד", "שיגיע"
    // all mean the same meeting; "וידאו", "אונליין", "מרחוק" all mean zoom.
    if (has(t, 'פרונטלי|פרונטלית|פרונטל') || /פנים אל פנים|אצלנו|במשרד|בסניף/.test(t)) {
      out.kind = 'frontal'
    } else if (has(t, 'זום') || /וידאו|אונליין|מרחוק|בזום/.test(t)) {
      out.kind = 'zoom'
    }

    // ── date ──
    const nextWeek = /שבוע הבא|בשבוע הבא/.test(t)
    let hoursAhead = null

    // "בעוד שעתיים" also pins the TIME, so it is resolved before anything else.
    const inHours = (() => {
      if (/(?:בעוד|עוד)\s+שעתיים/.test(t)) return 2
      if (/(?:בעוד|עוד)\s+שעה/.test(t)) return 1
      const dig = t.match(/(?:בעוד|עוד)\s+(\d+)\s*שעות/)
      if (dig) return +dig[1]
      const word = t.match(/(?:בעוד|עוד)\s+([א-ת]+)\s*שעות/)
      if (word && COUNT_WORD[word[1]]) return COUNT_WORD[word[1]]
      return null
    })()

    const inDays = (() => {
      if (/(?:בעוד|עוד)\s+יומיים/.test(t)) return 2
      const dig = t.match(/(?:בעוד|עוד)\s+(\d+)\s*ימים/)
      if (dig) return +dig[1]
      const word = t.match(/(?:בעוד|עוד)\s+([א-ת]+)\s*ימים/)
      if (word && COUNT_WORD[word[1]]) return COUNT_WORD[word[1]]
      return null
    })()

    // "בעוד שבועיים" — counted in days from here on, so everything downstream
    // sees one kind of answer.
    const inWeeks = (() => {
      if (/(?:בעוד|עוד)\s+שבועיים/.test(t)) return 2
      const dig = t.match(/(?:בעוד|עוד)\s+(\d+)\s*שבועות/)
      if (dig) return +dig[1]
      const word = t.match(/(?:בעוד|עוד)\s+([א-ת]+)\s*שבועות/)
      if (word && COUNT_WORD[word[1]]) return COUNT_WORD[word[1]]
      if (new RegExp(`(?:בעוד|עוד)\\s+שבוע(?![${HEB}])`, 'u').test(t)) return 1
      return null
    })()

    const inMonths = /(?:בעוד|עוד)\s+חודשיים/.test(t)
      ? 2
      : new RegExp(`(?:בעוד|עוד)\\s+חודש(?![${HEB}])`, 'u').test(t)
        ? 1
        : null

    if (inHours !== null) {
      const d = new Date(now.getTime() + inHours * 3600000)
      out.date = midnight(d)
      hoursAhead = { h: d.getHours(), m: d.getMinutes() }
    } else if (inDays !== null) {
      const d = midnight(now)
      d.setDate(d.getDate() + inDays)
      out.date = d
    } else if (inWeeks !== null) {
      const d = midnight(now)
      d.setDate(d.getDate() + inWeeks * 7)
      out.date = d
    } else if (inMonths !== null) {
      const d = midnight(now)
      d.setMonth(d.getMonth() + inMonths)
      out.date = d
    } else if (has(t, 'מחרתיים') || /אחרי מחר/.test(t)) {
      const d = midnight(now)
      d.setDate(d.getDate() + 2)
      out.date = d
    } else if (has(t, 'מחר')) {
      const d = midnight(now)
      d.setDate(d.getDate() + 1)
      out.date = d
    } else if (has(t, 'היום') || /הערב|הבוקר/.test(t)) {
      out.date = midnight(now)
    } else {
      // "ליום שלישי", "ביום ג", "שלישי הקרוב" — the day word is optional.
      const wd = t.match(
        new RegExp(`(?:יום\\s+)?(${WEEKDAYS.join('|')})(?![${HEB}])`, 'u')
      )
      // "יום ו" / "ליום ג" — the letter form, accepted only right after "יום"
      // so a stray conjunction ("ו") can never be read as Friday.
      const letter = t.match(new RegExp(`יום\\s+([אבגדהו])(?![${HEB}])`, 'u'))
      // "בסוף השבוע" is Thursday and "בתחילת השבוע" is Sunday — the Israeli
      // working week, which is not where a calendar would put either.
      const edge = /סוף\s*ה?שבוע/.test(t) ? 4 : /תחילת\s*ה?שבוע/.test(t) ? 0 : null
      if (wd || letter || edge !== null) {
        const want = wd
          ? WEEKDAYS.indexOf(wd[1])
          : letter
            ? DAY_LETTER[letter[1]]
            : edge
        const d = midnight(now)
        if (nextWeek) {
          // "יום שני בשבוע הבא" is Monday of the week that STARTS on the coming
          // Sunday. Just adding 7 to the next Monday overshoots by a week
          // whenever that Monday already falls in next week — which, with the
          // Israeli Sunday-start week, is most of the time.
          const toSunday = (7 - d.getDay()) % 7 || 7
          d.setDate(d.getDate() + toSunday + want)
        } else {
          // The NEXT time that weekday comes round, today included — saying
          // "יום שלישי" on a Tuesday means today, the way a calendar app reads it.
          d.setDate(d.getDate() + ((want - d.getDay() + 7) % 7))
        }
        out.date = d
      } else {
        // A named month: "ב-12 באוגוסט", "12 לאוגוסט".
        const named = t.match(
          new RegExp(`(\\d{1,2})\\s*[בל]?(${Object.keys(MONTH).join('|')})(?![${HEB}])`, 'u')
        )
        // An explicit date: "29/07" or "29.7.2026"
        const dm = t.match(/(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?/)
        if (named) {
          const day = +named[1]
          const mon = MONTH[named[2]]
          const d = new Date(now.getFullYear(), mon, day)
          // Said in December about January: the year they mean is the next one.
          if (d < midnight(now)) d.setFullYear(d.getFullYear() + 1)
          if (d.getDate() === day) out.date = d
        } else if (dm) {
          const day = +dm[1]
          const mon = +dm[2]
          let year = dm[3] ? +dm[3] : now.getFullYear()
          if (year < 100) year += 2000
          const d = new Date(year, mon - 1, day)
          if (d.getMonth() === mon - 1 && d.getDate() === day) out.date = d
        } else if (nextWeek) {
          const d = midnight(now)
          d.setDate(d.getDate() + 7)
          out.date = d
        }
      }
    }

    // ── time ──
    let h = null
    let m = 0

    // "בעוד שלושה ימים בעשר" — the counting phrase holds a number word that is
    // NOT the hour. Take it out of the text before looking for a time, or
    // "שלושה" wins over "עשר" and books 15:00 instead of 10:00.
    let tHour = t
      .replace(/(?:בעוד|עוד)\s+[א-ת\d]+\s*(?:ימים|שעות|שבועות|חודשים)/g, ' ')
      .replace(/(?:בעוד|עוד)\s+(?:יומיים|שעתיים|שבועיים|חודשיים|יום|שעה|שבוע|חודש)/g, ' ')

    // ── how long ──
    // Read before the clock, and taken out of the sentence, because "פגישה של
    // שעה וחצי מחר בארבע" carries a "וחצי" that belongs to the LENGTH. Left in,
    // it moves the meeting to 16:30 and loses the hour and a half entirely.
    for (const [re, mins] of DURATION) {
      const hit = tHour.match(re)
      if (!hit) continue
      out.dur = mins === null ? +hit[1] : mins
      tHour = tHour.replace(hit[0], ' ')
      break
    }
    if (out.dur !== null && !(out.dur >= 5 && out.dur <= 600)) out.dur = null

    // Minutes, likewise before the hour and likewise removed: the number words
    // collide head-on. In "בארבע וחמש" the חמש is five MINUTES, and an hour
    // search over the whole sentence is just as happy to read it as five.
    let mWord = null
    for (const [re, val] of MINUTES) {
      const hit = tHour.match(re)
      if (!hit) continue
      mWord = val
      tHour = tHour.replace(hit[0], ' ')
      break
    }

    if (hoursAhead) {
      h = hoursAhead.h
      m = hoursAhead.m
    } else {
      const hm = tHour.match(/(\d{1,2})[:.](\d{2})/)
      if (hm) {
        h = +hm[1]
        m = +hm[2]
      } else {
        const digit = tHour.match(/(?:בשעה|ב-|ב־|ב)\s*(\d{1,2})(?!\d)/)
        if (digit) h = +digit[1]
        else {
          // Two-word hours must be tried before one-word ones, or "שתים עשרה"
          // matches "שתים" and books 14:00 instead of noon.
          const words = Object.keys(HOUR_WORD).sort((a, b) => b.length - a.length)
          for (const w of words) {
            // The spoken hyphen: "שתים-עשרה" is the same hour as "שתים עשרה".
            const body = w.replace(/ /g, '[\\s-]*')
            if (new RegExp(`(?:בשעה\\s+)?[בו]?${body}(?![${HEB}])`, 'u').test(tHour)) {
              h = HOUR_WORD[w]
              break
            }
          }
        }
        if (mWord !== null) m = mWord
      }
    }

    const morning = /בבוקר|הבוקר/.test(t)
    const noonish = /בצהריים|בצהרים/.test(t)
    const afternoon = /אחר ?הצהריים|אחרי הצהריים/.test(t)
    const evening = /בערב|הערב/.test(t)

    // Said only "מחר בבוקר"? That still has to land somewhere sensible.
    if (h === null && !hoursAhead) {
      for (const part of DAYPART) {
        if (new RegExp(part.re, 'u').test(t)) {
          h = part.h
          m = 0
          break
        }
      }
    } else if (h !== null && !hoursAhead) {
      // Nobody books a sales meeting at 4am. Measured on 2,251 real meetings,
      // the day runs 09:00–19:00 — so a bare 1–8 means the afternoon, unless
      // the speaker actually said "בבוקר".
      if (!morning && h >= 1 && h <= 8) h += 12
      if (morning && h === 12) h = 0
      if ((evening || afternoon || noonish) && h >= 1 && h < 12) h += 12
    }

    if (h !== null) {
      // "רבע לארבע" arrives as 4 with −15; roll it back into the hour before.
      if (m < 0) {
        h -= 1
        m += 60
      }
      if (h >= 0 && h <= 23 && m >= 0 && m <= 59) out.time = { h, m }
    }

    // ── free note: everything after "תיאור" ──
    const note = t.match(/תיאור\s*[:,]?\s*(.+)$/)
    if (note) out.note = note[1].trim()

    // ── what to do with all of that ──
    out.action = detectAction(t)

    if (out.action === 'note') {
      out.note = noteText(t) || out.note
      // A note keeps its own words. "תרשום שלא ענה ואנסה שוב מחר" is one
      // sentence to write down, not a meeting for tomorrow — reading a date out
      // of it would book an appointment the agent never asked for.
      out.date = null
      out.time = null
      out.dur = null
      out.kind = null
      if (!out.note) out.action = null
    } else if (out.action === 'task') {
      // A task keeps its day and hour, and takes whatever was said after the
      // command word as its subject.
      if (!out.note) {
        const after = t.replace(new RegExp(`^.*?(?:${TASK_V})\\s*`, 'u'), '').trim()
        if (after.length >= 2) out.note = after.replace(NOTE_FILLER, '')
      }
      if (!out.date && !out.time && !out.note) out.action = null
    } else if (out.action === 'find') {
      out.date = null
      out.time = null
      out.dur = null
      out.kind = null
      out.note = null
    } else if (out.action === 'meeting') {
      if (!out.date && !out.time) out.action = null
    } else if (out.date || out.time) {
      // No verb at all, but a day and an hour — "מחר בארבע" on its own is the
      // shortest way anyone books a meeting.
      out.action = 'meeting'
    }

    return out
  }

  // ── Carrying it out ────────────────────────────────────────────────────────

  /** Fill the task form from a parsed command. Returns the fields touched. */
  function apply(p) {
    const filled = []

    // Only a MEETING is an Appointment. A task said out loud used to be filed
    // as one, which put a client appointment in the calendar nobody agreed to —
    // so for anything else the type is LEFT ALONE for BMBY's own default and
    // the agent's choice, rather than guessed at.
    if (p.action === 'meeting') {
      if (setSelect(FIELD.type, RES.TASK.meeting)) filled.push('סוג')
      setSelect(FIELD.priority, RES.PRIORITY.sales)
    }

    if (p.date) {
      // Both halves of BMBY's date — the visible field and the hidden companion
      // that submit actually reads. Setting only the visible one saves today.
      if (setText(FIELD.date, bmbyDate(p.date))) filled.push('תאריך')
      setHidden(FIELD.dateHidden, isoDate(p.date))
    }

    if (p.time) {
      const start = new Date(2000, 0, 1, p.time.h, p.time.m)
      const end = new Date(start.getTime() + (p.dur || 60) * 60000)
      if (setSelect(FIELD.hourStart, String(start.getHours()))) filled.push('שעה')
      setSelect(FIELD.minuteStart, snapMinute(start.getMinutes()))
      setSelect(FIELD.hourEnd, String(end.getHours()))
      setSelect(FIELD.minuteEnd, snapMinute(end.getMinutes()))
    }

    if (p.kind) {
      const label = p.kind === 'zoom' ? 'פגישת זום' : 'פגישה פרונטלית'
      const cur = (RES.byName(FIELD.subject, 'text') || {}).value || ''
      if (setText(FIELD.subject, cur ? `${label} - ${cur}` : label)) filled.push('נושא')
    }

    if (p.note) {
      const box = document.querySelector(`[name="${FIELD.message}"]`)
      const cur = box ? box.value : ''
      if (setText(FIELD.message, cur ? `${cur}\n${p.note}` : p.note)) filled.push('תוכן')
    }

    return filled
  }

  /**
   * The content field, by name.
   *
   * Taken from a saved copy of the real page rather than guessed: it is
   * <textarea name="CRM_Message"> under the label "תוכן:".
   *
   * Picking "the first visible textarea" would have been wrong: the page also
   * carries CRM_Mail_Message for the mail panel, and a note would have had an
   * even chance of being typed into an email instead.
   */
  function noteBox() {
    const named = document.querySelector(`textarea[name="${FIELD.message}"]`)
    if (named && !named.disabled && !named.readOnly) return named

    const visible = (b) => {
      if (b.disabled || b.readOnly || b.hidden) return false
      // Judged from computed style, not offsetParent — offsetParent is a LAYOUT
      // property and is also null for anything position:fixed.
      const st = window.getComputedStyle ? window.getComputedStyle(b) : null
      return !st || (st.display !== 'none' && st.visibility !== 'hidden')
    }
    return (
      [...document.querySelectorAll('textarea')].filter(
        (b) => visible(b) && !/mail/i.test(b.name || b.id || '')
      )[0] || null
    )
  }

  function doNote(text) {
    const box = noteBox()
    if (!box) return false
    const cur = box.value || ''
    box.value = cur ? `${cur}\n${text}` : text
    box.dispatchEvent(new Event('input', { bubbles: true }))
    box.dispatchEvent(new Event('change', { bubbles: true }))
    box.focus()
    try {
      box.setSelectionRange(box.value.length, box.value.length)
    } catch {
      /* not all fields support selection */
    }
    return true
  }

  /** "תבדוק אם יש לו פגישה" — press the control the extension already draws. */
  function doFind() {
    const btn = document.querySelector('.res-hbtn')
    if (!btn) return false
    btn.click()
    return true
  }

  // ── the bar ────────────────────────────────────────────────────────────────

  let rec = null
  let live = false
  let heard = ''
  let parsed = null
  let root = null
  let elHeard = null
  let elPrev = null
  let elHint = null
  let cfgToken = '0000'

  let audioCtx = null
  let micStream = null
  let analyser = null
  let meterRaf = null
  let bars = []

  // ── The conversation ───────────────────────────────────────────────────────
  //
  // 'listening'  waiting for the agent to say what they want
  // 'confirming' the bot has understood, has shown it, and is waiting for a
  //              spoken כן / לא
  //
  // The agent never has to reach for the keyboard: they talk, the bot shows
  // back, they answer. Enter and the buttons stay as a silent alternative.
  let stage = 'listening'
  // How much had been heard when the question was asked. Only speech AFTER that
  // point counts as the answer — otherwise a note containing the word "לא"
  // ("הוא לא ענה") would read as a refusal of the bot's own question.
  let askedAt = 0

  // NO \b HERE. Hebrew letters are not word characters in JavaScript regex, so
  // /כן\b/ never matches "כן" — the same trap the date parser documents at the
  // top of this file. The boundary has to be spelled out as "not a Hebrew
  // letter", or every spoken answer is silently ignored.
  const YES = /^\s*(כן|בסדר|אישור|מאשר|אוקיי|אוקי|יאללה|נכון|בדיוק|תעשה|קדימה|בטח)(?![א-ת])/u
  const NO = /^\s*(לא|ביטול|בטל|עזוב|טעות|רגע)(?![א-ת])/u

  /**
   * What it understood, as parts rather than a sentence — so the pieces it may
   * have got wrong can be corrected by touching them, instead of making the
   * agent say the whole thing again.
   */
  function understood(p) {
    if (!p || !p.action) return { title: '', chips: [] }
    if (p.action === 'note') return { title: 'לרשום הערה', chips: [{ text: `״${p.note}״` }] }
    if (p.action === 'find') return { title: 'לחפש אם כבר יש לו פגישה', chips: [] }

    const chips = []
    if (p.action === 'meeting') {
      chips.push({
        text: p.kind === 'zoom' ? 'זום' : 'פרונטלית',
        edit: 'kind',
      })
    }
    if (p.note && p.action === 'task') chips.push({ text: `״${p.note}״` })
    if (p.date) {
      chips.push({
        text: `יום ${WEEKDAYS[p.date.getDay()]}, ${bmbyDate(p.date)}`,
        edit: 'date',
      })
    }
    if (p.time) {
      chips.push({
        text: `${String(p.time.h).padStart(2, '0')}:${String(p.time.m).padStart(2, '0')}`,
        edit: 'time',
      })
    }
    // Only when it is not the hour everyone assumes — a chip that always says
    // the same thing is one more thing to read and nothing to check.
    if (p.dur && p.dur !== 60) {
      chips.push({
        text:
          p.dur === 90
            ? 'שעה וחצי'
            : p.dur % 60 === 0
              ? `${p.dur / 60} שעות`
              : `${p.dur} דק׳`,
      })
    }
    return { title: p.action === 'task' ? 'ליצור משימה' : 'לקבוע פגישה', chips }
  }

  /** Swap a chip for a native picker, and put the answer straight into `parsed`. */
  function editChip(chip, kind) {
    if (kind === 'kind') {
      parsed.kind = parsed.kind === 'zoom' ? 'frontal' : 'zoom'
      redraw()
      return
    }

    const input = document.createElement('input')
    input.className = 'res-cmd-edit'
    if (kind === 'time') {
      input.type = 'time'
      input.value = parsed.time
        ? `${String(parsed.time.h).padStart(2, '0')}:${String(parsed.time.m).padStart(2, '0')}`
        : ''
    } else {
      input.type = 'date'
      input.value = parsed.date ? isoDate(parsed.date) : ''
    }

    const commit = () => {
      if (kind === 'time' && /^\d{2}:\d{2}$/.test(input.value)) {
        const [h, m] = input.value.split(':').map(Number)
        parsed.time = { h, m }
      } else if (kind === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(input.value)) {
        parsed.date = new Date(`${input.value}T00:00:00`)
      }
      redraw()
    }
    input.onchange = commit
    // Typing here must not reach the bar's own Escape/Enter handling, or a
    // stray keystroke would confirm or close mid-edit.
    input.onkeydown = (e) => {
      e.stopPropagation()
      if (e.key === 'Enter') {
        commit()
      } else if (e.key === 'Escape') {
        redraw()
      }
    }

    chip.textContent = ''
    chip.appendChild(input)
    input.focus()
    if (input.showPicker) {
      try {
        input.showPicker()
      } catch {
        /* not every browser build allows it without a gesture */
      }
    }
  }

  // ── Hearing, and being heard ───────────────────────────────────────────────
  //
  // The old indicator was a pulsing dot on a CSS animation: it pulsed happily
  // whether or not the microphone was working, so a dead mic looked exactly
  // like a live one. These bars are driven by the actual signal, so if nothing
  // moves, nothing is being heard — and that is worth knowing immediately.

  /** A short tone. No audio files to bundle, load or fail. */
  function beep(freq, ms, when = 0, gain = 0.05) {
    try {
      if (!audioCtx) return
      const osc = audioCtx.createOscillator()
      const vol = audioCtx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      // Ramped, not switched: an instant start and stop is heard as a click.
      const t0 = audioCtx.currentTime + when
      vol.gain.setValueAtTime(0, t0)
      vol.gain.linearRampToValueAtTime(gain, t0 + 0.015)
      vol.gain.linearRampToValueAtTime(0, t0 + ms / 1000)
      osc.connect(vol)
      vol.connect(audioCtx.destination)
      osc.start(t0)
      osc.stop(t0 + ms / 1000 + 0.02)
    } catch {
      /* audio is a courtesy, never a requirement */
    }
  }

  /** Rising pair — "I am listening". */
  const soundListening = () => {
    beep(587, 90)
    beep(880, 110, 0.085)
  }
  /** Brighter, tighter pair — "I understood". Deliberately unlike the first,
   *  because the whole point is telling them apart without looking. */
  const soundUnderstood = () => {
    beep(880, 70)
    beep(1319, 110, 0.07)
  }

  function startMeter(stream) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return
      audioCtx = new AC()
      const src = audioCtx.createMediaStreamSource(stream)
      analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.75
      src.connect(analyser)

      const data = new Uint8Array(analyser.frequencyBinCount)
      const tick = () => {
        meterRaf = requestAnimationFrame(tick)
        if (!analyser || !bars.length) return
        analyser.getByteFrequencyData(data)
        // One band per bar, low frequencies first — speech lives down there, so
        // the movement tracks the voice rather than room hiss.
        const per = Math.max(1, Math.floor(data.length / 3 / bars.length))
        for (let i = 0; i < bars.length; i++) {
          let sum = 0
          for (let j = 0; j < per; j++) sum += data[i * per + j] || 0
          const level = Math.min(1, sum / per / 140)
          bars[i].style.height = `${Math.max(12, level * 100)}%`
        }
      }
      tick()
    } catch {
      /* no meter is survivable; a broken bar is not */
    }
  }

  function stopAudio() {
    if (meterRaf) cancelAnimationFrame(meterRaf)
    meterRaf = null
    analyser = null
    bars = []
    if (micStream) {
      micStream.getTracks().forEach((t) => t.stop())
      micStream = null
    }
    if (audioCtx) {
      // Closed on a delay so a beep fired at the same moment still sounds.
      const ctx = audioCtx
      audioCtx = null
      setTimeout(() => {
        try {
          ctx.close()
        } catch {
          /* already closed */
        }
      }, 400)
    }
  }

  function ensureStyle() {
    if (document.getElementById('res-cmd-style')) return
    const s = document.createElement('style')
    s.id = 'res-cmd-style'
    s.textContent = `
.res-cmd-wrap {
  position: fixed; inset: 0; z-index: 2147483000;
  background: rgba(15,23,42,.45); backdrop-filter: blur(3px);
  display: flex; align-items: flex-start; justify-content: center;
  padding-top: 14vh; direction: rtl;
  font-family: 'RES Rubik', Rubik, Arial, sans-serif;
}
.res-cmd {
  width: min(560px, 92vw); background: #fff; border-radius: 16px;
  box-shadow: 0 24px 60px -12px rgba(15,23,42,.5); overflow: hidden;
}
.res-cmd-top {
  display: flex; align-items: center; gap: 10px; padding: 16px 18px;
  border-bottom: 1px solid #e2e8f0;
}
/* The signal meter. Seven bars, each sized from the live microphone in
   startMeter() — so a dead mic reads as dead instead of pulsing politely. */
.res-cmd-meter {
  display: flex; align-items: center; gap: 3px; flex: none;
  width: 34px; height: 26px;
}
.res-cmd-bar {
  flex: 1; height: 12%; min-height: 3px; border-radius: 2px;
  background: #b91c1c; transition: height .07s linear;
}
.res-cmd-heard {
  flex: 1; font-size: 17px; font-weight: 700; color: #0f172a; min-height: 24px;
}
.res-cmd-heard.idle { color: #94a3b8; font-weight: 500; }
/* The bot's own line reads as a question, not as a transcript. */
.res-cmd-lead { color: #64748b; font-weight: 700; font-size: 14px; }
/* What it understood, stated plainly — not a row of fragments to decode. */
.res-cmd-understood {
  background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px;
  padding: 14px 16px; width: 100%;
}
.res-cmd-what { font-size: 19px; font-weight: 800; color: #0f172a; line-height: 1.35; }
.res-cmd-chips { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 10px; }
.res-cmd-part {
  background: #fff; border: 1px solid #cbd5e1; border-radius: 999px;
  padding: 5px 13px; font-size: 14.5px; font-weight: 700; color: #0f172a;
}
/* A part it may have misheard looks touchable, so the fix is discoverable
   without a tooltip nobody hovers to read. */
.res-cmd-editable {
  cursor: pointer; border-color: #94a3b8; border-style: dashed;
  transition: background .12s, border-color .12s;
}
.res-cmd-editable:hover { background: #f1f5f9; border-color: #0f172a; border-style: solid; }
.res-cmd-editable::after { content: ' ✎'; color: #64748b; font-size: 12px; }
.res-cmd-edit {
  border: 0; background: transparent; font: inherit; color: inherit;
  padding: 0; min-width: 96px; outline: none;
}
.res-cmd-prev { padding: 14px 18px; display: flex; flex-wrap: wrap; gap: 8px; }

.res-cmd-foot {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 18px; background: #f8fafc; border-top: 1px solid #e2e8f0;
}
.res-cmd-btn {
  border: 0; border-radius: 10px; padding: 8px 16px; cursor: pointer;
  font-size: 13px; font-weight: 800; font-family: inherit;
  background: #0f172a; color: #fff;
}
.res-cmd-btn[disabled] { opacity: .4; cursor: default; }
.res-cmd-btn.ghost { background: #fff; color: #334155; border: 1px solid #cbd5e1; }
.res-cmd-hint { font-size: 12px; color: #64748b; margin-inline-start: auto; }
.res-cmd-hint b { color: #0f172a; }

/* ── The eye-level button, beside the lead's name ────────────────────────── */
.res-voice-pill {
  display: inline-flex; align-items: center; gap: 7px; vertical-align: middle;
  margin: 0 8px; padding: 7px 14px; border: 0; border-radius: 999px;
  background: #0f172a; color: #fff; cursor: pointer;
  font-family: 'RES Rubik', Rubik, Arial, sans-serif; font-size: 13px; font-weight: 800;
  box-shadow: 0 2px 8px -2px rgba(15,23,42,.5);
  transition: transform .15s ease, box-shadow .15s ease, background .15s ease;
}
.res-voice-pill:hover {
  background: #1e293b; transform: translateY(-1px);
  box-shadow: 0 6px 16px -4px rgba(15,23,42,.55);
}
.res-voice-pill:active { transform: translateY(0) scale(.97); }
.res-voice-ico { display: flex; color: #fbbf24; }
.res-voice-kbd {
  font-size: 10px; font-weight: 700; color: #94a3b8; direction: ltr;
  background: rgba(255,255,255,.1); border-radius: 5px; padding: 1px 5px;
}

/* ── The floating button ─────────────────────────────────────────────────── */
.res-fab-hidden { opacity: 0; pointer-events: none; transform: translateY(10px); }
.res-fab {
  position: fixed; bottom: 26px; left: 26px; z-index: 2147482000;
  display: flex; align-items: center; gap: 0;
  height: 52px; padding: 0 15px; border: 0; border-radius: 999px;
  background: #0f172a; color: #fff; cursor: pointer;
  font-family: 'RES Rubik', Rubik, Arial, sans-serif; direction: rtl;
  box-shadow: 0 10px 26px -8px rgba(15,23,42,.55), 0 2px 6px rgba(15,23,42,.3);
  transition: gap .22s cubic-bezier(.22,1,.36,1), padding .22s cubic-bezier(.22,1,.36,1),
              transform .22s ease, box-shadow .18s ease, opacity .22s ease;
}
.res-fab:hover { gap: 10px; padding: 0 20px 0 15px; transform: translateY(-2px);
  box-shadow: 0 16px 34px -10px rgba(15,23,42,.6), 0 3px 8px rgba(15,23,42,.35); }
.res-fab:active { transform: translateY(0) scale(.97); }
.res-fab-ico { display: flex; color: #fbbf24; flex: none; }
/* The label is folded to zero width until hover, so the resting state stays a
   quiet circle instead of a permanent banner across the page. */
.res-fab-label {
  display: flex; flex-direction: column; align-items: flex-start;
  max-width: 0; overflow: hidden; white-space: nowrap;
  transition: max-width .22s cubic-bezier(.22,1,.36,1);
}
.res-fab:hover .res-fab-label { max-width: 130px; }
.res-fab-title { font-size: 13.5px; font-weight: 800; line-height: 1.2; }
.res-fab-kbd { font-size: 10.5px; font-weight: 600; color: #94a3b8; direction: ltr; }
/* A slow breath, so the button is noticed once and then ignored. */
.res-fab-ring {
  position: absolute; inset: 0; border-radius: 999px; pointer-events: none;
  box-shadow: 0 0 0 0 rgba(251,191,36,.5);
  animation: res-fab-breathe 3.4s ease-out infinite;
}
.res-fab:hover .res-fab-ring { animation: none; }
@keyframes res-fab-breathe {
  0%   { box-shadow: 0 0 0 0 rgba(251,191,36,.45); }
  55%  { box-shadow: 0 0 0 13px rgba(251,191,36,0); }
  100% { box-shadow: 0 0 0 0 rgba(251,191,36,0); }
}
@media (prefers-reduced-motion: reduce) {
  .res-fab-ring { animation: none; }
  .res-cmd-bar { transition: none; }
}
`
    document.head.appendChild(s)
  }

  /**
   * Understand what was just said, and if it amounts to something, ask.
   *
   * Synchronous on purpose. There is no model, no request and no timer here —
   * which is why nothing can hang, and why the answer is on screen before the
   * agent has finished lowering the phone.
   */
  function settle(finished) {
    parsed = parse(heard)
    if (finished && parsed.action) {
      stage = 'confirming'
      askedAt = heard.length
      soundUnderstood()
    }
    redraw()
  }

  function redraw() {
    if (!root) return
    const okBtn = root.querySelector('.res-cmd-ok')

    // ── understood something → show it, and wait for a yes ──
    if (stage === 'confirming' && parsed && parsed.action) {
      elHeard.textContent = 'הבנתי שאתה רוצה:'
      elHeard.className = 'res-cmd-heard res-cmd-lead'

      const { title, chips } = understood(parsed)
      elPrev.textContent = ''
      const card = elc('div', 'res-cmd-understood')
      card.appendChild(elc('div', 'res-cmd-what', title))
      if (chips.length) {
        const row = elc('div', 'res-cmd-chips')
        for (const c of chips) {
          const el = elc('span', 'res-cmd-part' + (c.edit ? ' res-cmd-editable' : ''), c.text)
          if (c.edit) {
            el.title = 'לחצו לתיקון'
            el.onclick = () => editChip(el, c.edit)
          }
          row.appendChild(el)
        }
        card.appendChild(row)
      }
      elPrev.appendChild(card)

      okBtn.disabled = false
      okBtn.textContent = 'אישור'
      elHint.innerHTML = 'אמרו <b>״כן״</b> · לחצו על פרט כדי לתקן'
      return
    }

    // ── still listening: the words only, no half-made guesses ──
    elHeard.textContent = heard || 'דברו…  לדוגמה: "תקבע לו פגישה מחר בארבע"'
    elHeard.className = 'res-cmd-heard' + (heard ? '' : ' idle')
    elPrev.textContent = ''

    okBtn.disabled = true
    okBtn.textContent = 'אישור'
    elHint.innerHTML = heard
      ? 'מקשיב…'
      : 'אמרו מה לעשות — למשל "תקבע לו מחר בארבע" או "תרשום שלא ענה"'
  }

  function close() {
    live = false
    stopAudio()
    stage = 'listening'
    askedAt = 0
    if (rec) {
      try {
        rec.stop()
      } catch {
        /* already stopped */
      }
    }
    rec = null
    if (root) root.remove()
    root = null
    document.removeEventListener('keydown', onKey, true)
  }

  /**
   * On the task form there are fields to fill. On the lead page there are none —
   * so the command is parked and the form is opened, which then fills itself
   * from it. Same hand-off the meeting card already uses, so a spoken meeting
   * and a picked meeting arrive by exactly one road.
   */
  async function confirm() {
    if (!parsed || !parsed.action) return

    // A note is written INTO THE SAME FORM, not onto the lead page. The field
    // it needs (CRM_Message, under the label "תוכן:") lives on TaskEdit — the
    // markup that carries it is stamped txtTaskEditTitle. Trying to type it
    // into the lead page is why nothing appeared: the field was never there.
    // On the form itself it is filled directly; from the lead page the form is
    // opened carrying the text.
    if (parsed.action === 'note' && RES.isForm) {
      const ok = await doNote(parsed.note)
      close()
      RES.banner(
        ok ? 'ההערה נכתבה — בדקו ולחצו אישור' : 'לא מצאתי את שדה התוכן בטופס',
        ok ? 'ok' : 'bad'
      )
      return
    }

    // Press the extension's own "חפש פגישה", which already knows how to look.
    if (parsed.action === 'find') {
      const ok = doFind()
      close()
      if (!ok) RES.banner('חיפוש פגישה לא זמין בעמוד הזה', 'bad')
      return
    }

    if (RES.isForm) {
      const filled = apply(parsed)
      close()
      RES.banner(
        filled.length
          ? `מולא בקול: ${filled.join(' · ')} — בדקו ולחצו אישור`
          : 'לא היה מה למלא',
        filled.length ? 'ok' : 'bad'
      )
      return
    }

    const id = RES.clientIdFromUrl()
    const carry = {
      action: parsed.action,
      // A Date does not survive chrome.storage, so it travels as ISO.
      date: parsed.date ? isoDate(parsed.date) : null,
      time: parsed.time,
      dur: parsed.dur,
      kind: parsed.kind,
      note: parsed.note,
      at: Date.now(),
    }
    close()
    chrome.storage.local.set({ voice: carry }).then(() => {
      window.open(
        `https://www.bmby.com/CRMTasks/TaskEdit.php?ClientID=${encodeURIComponent(id)}` +
          `&actions=addToClient&TaskType=Appointment`,
        '_blank',
        'width=820,height=760'
      )
    })
  }

  /**
   * The form side of the hand-off. Short-lived on purpose: a command spoken an
   * hour ago must never fill a form opened now for somebody else.
   */
  async function pickup() {
    const { voice } = await chrome.storage.local.get('voice')
    if (!voice || Date.now() - voice.at >= RES.HANDOFF_TTL_MS) return
    await chrome.storage.local.remove('voice')
    const p = {
      action: voice.action || 'meeting',
      date: voice.date ? new Date(`${voice.date}T00:00:00`) : null,
      time: voice.time || null,
      dur: voice.dur || null,
      kind: voice.kind || null,
      note: voice.note || null,
    }
    const filled = apply(p)
    if (filled.length) {
      RES.banner(`מולא בקול: ${filled.join(' · ')} — בדקו ולחצו אישור`, 'ok')
    }
  }

  function onKey(e) {
    if (!root) return
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      confirm()
    }
  }

  async function open() {
    if (root) return
    ensureStyle()
    heard = ''
    parsed = null
    stage = 'listening'
    askedAt = 0

    root = elc('div', 'res-cmd-wrap')
    const card = elc('div', 'res-cmd')
    const top = elc('div', 'res-cmd-top')
    // Seven bars driven by the real signal — see startMeter().
    const meter = elc('span', 'res-cmd-meter')
    bars = []
    for (let i = 0; i < 7; i++) {
      const b = elc('span', 'res-cmd-bar')
      bars.push(b)
      meter.appendChild(b)
    }
    top.appendChild(meter)
    elHeard = elc('div', 'res-cmd-heard idle')
    top.appendChild(elHeard)
    elPrev = elc('div', 'res-cmd-prev')

    const foot = elc('div', 'res-cmd-foot')
    const ok = elc('button', 'res-cmd-btn res-cmd-ok', 'מלא את הטופס')
    ok.type = 'button'
    ok.onclick = confirm
    const cancel = elc('button', 'res-cmd-btn ghost', 'ביטול')
    cancel.type = 'button'
    cancel.onclick = close
    elHint = elc('span', 'res-cmd-hint')
    foot.appendChild(ok)
    foot.appendChild(cancel)
    foot.appendChild(elHint)

    card.appendChild(top)
    card.appendChild(elPrev)
    card.appendChild(foot)
    root.appendChild(card)
    root.onclick = (e) => {
      if (e.target === root) close()
    }
    document.body.appendChild(root)
    document.addEventListener('keydown', onKey, true)
    redraw()

    // getUserMedia is what actually raises Chrome's permission bar; starting
    // recognition cold on a page that never had the mic fails silently.
    try {
      // The stream is KEPT, not stopped: it feeds the level meter. Speech
      // recognition opens its own capture alongside it.
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      startMeter(micStream)
      soundListening()
    } catch (err) {
      heard = err && err.name === 'NotFoundError' ? 'לא נמצא מיקרופון' : 'אין הרשאת מיקרופון'
      redraw()
      return
    }

    rec = new SR()
    rec.lang = 'he-IL'
    rec.continuous = true
    rec.interimResults = true
    rec.onresult = (e) => {
      let text = ''
      let settled = false
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i][0].transcript
        // Chrome flags a result final once it hears the speaker stop.
        if (e.results[i].isFinal) settled = true
      }
      heard = clean(text)

      if (stage === 'confirming') {
        // Only what was said AFTER the question counts as the answer.
        const reply = heard.slice(askedAt).trim()
        if (YES.test(reply)) {
          confirm()
        } else if (NO.test(reply)) {
          // Start over rather than close: the agent usually wants to rephrase,
          // not to give up.
          stage = 'listening'
          parsed = null
          heard = ''
          askedAt = 0
          redraw()
        } else if (reply.length >= 4) {
          // Neither yes nor no, but a real sentence — the agent is CORRECTING,
          // not answering ("לקבוע ב-16:00?" · "לא, מחר בעשר" arrives without the
          // "לא"). Treat it as a new instruction and ask again, rather than
          // standing there repeating a question they have moved past.
          stage = 'listening'
          askedAt = 0
          settle()
        } else {
          redraw()
        }
        return
      }

      // The dictionary answers instantly and offline. There is nothing to wait
      // for, so the moment Chrome says the sentence is finished the bar can ask
      // for confirmation — and while the agent is still talking it just listens.
      settle(settled)
    }
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return
      heard = 'ההאזנה נעצרה'
      redraw()
    }
    rec.onend = () => {
      if (!live) return
      try {
        rec.start()
      } catch {
        /* gone */
      }
    }
    live = true
    try {
      rec.start()
    } catch {
      heard = 'לא הצלחתי להתחיל'
      redraw()
    }
  }

  /**
   * The button.
   *
   * Alt+K is faster once you know it, and nobody knows it. A visible control is
   * what makes the feature exist for everyone else — so the shortcut is printed
   * on the button itself, and the ones who want it graduate to the keyboard.
   *
   * Bottom-LEFT on purpose: BMBY keeps its own action rail down the right edge,
   * and a floating button there would sit on top of it.
   */
  function micIcon(cls) {
    const span = elc('span', cls || 'res-voice-ico')
    span.innerHTML =
      '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>' +
      '<path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/></svg>'
    return span
  }

  function fab() {
    if (document.getElementById('res-fab')) return
    const btn = elc('button', 'res-fab')
    btn.id = 'res-fab'
    btn.type = 'button'
    btn.title = 'עוזר קולי · Alt+K'
    btn.setAttribute('aria-label', 'עוזר קולי')

    const ring = elc('span', 'res-fab-ring')
    const ico = micIcon('res-fab-ico')

    const label = elc('span', 'res-fab-label')
    label.appendChild(elc('span', 'res-fab-title', 'עוזר קולי'))
    label.appendChild(elc('span', 'res-fab-kbd', 'Alt+K'))

    btn.appendChild(ring)
    btn.appendChild(ico)
    btn.appendChild(label)
    btn.onclick = (e) => {
      e.preventDefault()
      open()
    }
    document.body.appendChild(btn)
  }

  /**
   * The button that is actually in the eyeline.
   *
   * Bottom-left was a corner nobody looked at. This one sits in the extension's
   * own controls row beside the lead's NAME — the first thing read on the page,
   * and a strip we already own, so BMBY's layout is untouched and nothing can
   * overlap. It flows with the page rather than floating over it.
   */
  function inlineBtn() {
    if (document.getElementById('res-voice-inline')) return true
    const row =
      document.querySelector('.res-hcontrols') ||
      (RES.meetings && RES.meetings.headerName && RES.meetings.headerName())
    if (!row) return false

    const btn = elc('button', 'res-voice-pill')
    btn.id = 'res-voice-inline'
    btn.type = 'button'
    btn.title = 'עוזר קולי · Alt+K'
    btn.appendChild(micIcon())
    btn.appendChild(elc('span', null, 'עוזר קולי'))
    btn.appendChild(elc('span', 'res-voice-kbd', 'Alt+K'))
    btn.onclick = (e) => {
      e.preventDefault()
      open()
    }

    if (row.classList.contains('res-hcontrols')) row.appendChild(btn)
    else row.insertAdjacentElement('afterend', btn)

    // The floating copy is only worth showing once this one has scrolled away —
    // two identical buttons on screen at once is just clutter. It is hidden
    // FIRST and unconditionally: if IntersectionObserver is unavailable the
    // right outcome is one button, not two.
    const fabEl = document.getElementById('res-fab')
    if (fabEl) {
      fabEl.classList.add('res-fab-hidden')
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(
          ([entry]) => fabEl.classList.toggle('res-fab-hidden', entry.isIntersecting),
          { threshold: 0 }
        ).observe(btn)
      }
    }
    return true
  }

  function attach(opts) {
    if (!SR) return
    // Same shared token the rest of the extension already sends.
    if (opts && opts.token) cfgToken = opts.token
    ensureStyle()

    // Alt+K, not Alt+Space — Windows owns Alt+Space for the window menu.
    window.addEventListener(
      'keydown',
      (e) => {
        if (
          e.altKey &&
          !e.ctrlKey &&
          !e.shiftKey &&
          (e.key === 'k' || e.key === 'K' || e.code === 'KeyK')
        ) {
          e.preventDefault()
          open()
        }
      },
      true
    )

    fab()

    // The controls row is built by meetings.js, which runs after this — so keep
    // looking for a short while rather than assuming it is already there.
    if (!inlineBtn()) {
      const obs = new MutationObserver(() => {
        if (inlineBtn()) obs.disconnect()
      })
      obs.observe(document.documentElement, { childList: true, subtree: true })
      setTimeout(() => obs.disconnect(), 15_000)
    }

    if (RES.isForm) pickup()
  }

  return { attach, parse, understood, apply }
})()
