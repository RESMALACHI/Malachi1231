// The links and details agents need on hand — zoom rooms to send a client, the
// course schedule, the branches, and the accounts clients pay into.
//
// Everything the page shows lives here, so updating a link or an account number
// never means touching the page's markup.

export const ZOOM_ROOMS = [
  {
    id: 'itzik',
    name: 'החדר של איציק',
    hint: 'חדר הזום הראשי',
    url: 'https://us06web.zoom.us/my/itzikhasidim?omn=81824191670',
  },
  {
    id: 'second',
    name: 'החדר השני',
    hint: 'חדר זום נוסף',
    url: 'https://us06web.zoom.us/j/3573253888?omn=84816017573',
  },
]

export const LINKS = [
  {
    id: 'hagshama',
    name: 'פרוייקט הגשמה',
    hint: 'אתר הפרוייקט לשליחה ללקוחות',
    url: 'https://www.res-students.com',
  },
  {
    id: 'schedule',
    name: 'טבלת לוז קורסים',
    hint: 'לוח הזמנים של הקורסים',
    url: 'https://docs.google.com/spreadsheets/d/1lz9HltnZdpM2nmDn2mcu72M5SL0WlK5-/edit?usp=sharing&ouid=110317778931141760922&rtpof=true&sd=true',
  },
  {
    id: 'branches',
    name: 'סניפים',
    hint: 'רשימת הסניפים באתר',
    url: 'https://www.res-nadlan.co.il/%D7%A1%D7%A0%D7%99%D7%A4%D7%99%D7%9D/',
  },
]

export const BANK_ACCOUNTS = [
  {
    id: 'college',
    name: 'חשבון המכללה',
    fields: [
      { label: 'ע״ש', value: 'אר אי אס' },
      { label: 'בנק', value: 'לאומי' },
      { label: 'סניף', value: '753' },
      { label: 'חשבון', value: '9822043' },
    ],
  },
  {
    id: 'union',
    name: 'חשבון איגוד הנדל״ן',
    fields: [
      { label: 'ע״ש', value: 'עמותת תמיכה בנדלן' },
      { label: 'בנק', value: 'לאומי' },
      { label: 'סניף', value: '753' },
      { label: 'חשבון', value: '9790026' },
    ],
  },
]

/** The whole account as one block — what an agent actually pastes to a client. */
export const accountAsText = (acc) =>
  acc.fields.map((f) => `${f.label}: ${f.value}`).join('\n')
