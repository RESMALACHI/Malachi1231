import { test } from 'node:test'
import assert from 'node:assert/strict'
import { measureLine, penaltyFor, sessionMetrics, turningPoints, clampTrust } from './simMetrics.js'

// The pitch the model once let through as "a question" — the reason this file exists.
const PITCH =
  'אז תשמע, יש לנו פרויקט הגשמה שהוא 7 קורסים מתוך 13, כלים דיגיטליים בשווי 19,800, מנטור אישי, תעודות ממשרד העבודה, והכול מסובסד על ידי איגוד הנדל"ן, ממש הזדמנות, אתה חייב לבוא לפגישה'

test('a long pitch with no question is a monologue, and pressure is caught', () => {
  const m = measureLine(PITCH)
  assert.equal(m.asked, false)
  assert.equal(m.monologue, true)
  assert.equal(m.pressure, 'חייב')
  assert.equal(m.meetingAsk, true)
  assert.equal(penaltyFor(m), -3)
})

test('a question counts without a question mark — speech-to-text rarely writes one', () => {
  assert.equal(measureLine('ספר לי מה גרם לך להשאיר פרטים').asked, true)
  assert.equal(measureLine('איך זה נשמע לך').asked, true)
  assert.equal(measureLine('شو اللي خلاك تترك تفاصيل').asked, true)
  assert.equal(measureLine('אוקיי מעולה').asked, false)
})

test('question words inside other words do not count', () => {
  // "מהמם" starts with מה, "מיד" with מי — neither is a question.
  assert.equal(measureLine('מהמם, אני מיד שולחת').asked, false)
})

test('a short clean line costs nothing', () => {
  assert.equal(penaltyFor(measureLine('שאלה הוגנת. המחיר תלוי בסבסוד, ספר לי מה חשוב לך?')), 0)
})

test('a long line that still asks is charged one, not two', () => {
  const words = Array.from({ length: 50 }, () => 'מילה').join(' ') + ' מה דעתך?'
  const m = measureLine(words)
  assert.equal(m.monologue, false)
  assert.equal(m.long, true)
  assert.equal(penaltyFor(m), -1)
})

test('two concrete slots joined by "or" is the binary close', () => {
  assert.equal(measureLine('יש לי ביום ראשון ב-11:00 או ביום רביעי ב-17:00, מה עדיף?').twoOptions, true)
  assert.equal(measureLine('מחר בשעה 10 או מחרתיים בשעה 18?').twoOptions, true)
  // One slot is not a choice; "שני דברים" is not Monday.
  assert.equal(measureLine('אפשר מחר ב-11:00?').twoOptions, false)
  assert.equal(measureLine('יש שני דברים או שלושה').twoOptions, false)
})

test('meeting words are found with a Hebrew prefix, not inside unrelated words', () => {
  assert.equal(measureLine('בוא נקבע לך שיחת ייעוץ').meetingAsk, true)
  assert.equal(measureLine('ובפגישה תקבל מספר מדויק').meetingAsk, true)
  assert.equal(measureLine('אני מבינה אותך לגמרי').meetingAsk, false)
})

test('session metrics add up the call', () => {
  const t = [
    { role: 'prospect', text: 'כן הלו?', trust: 4 },
    { role: 'rep', text: 'היי דני, מדברת עדי, יש לך דקה?' },
    { role: 'prospect', text: 'כן, כמה זה עולה?', trust: 4 },
    { role: 'rep', text: PITCH },
    { role: 'prospect', text: 'לא מעניין, ביי', trust: 0 },
  ]
  const s = sessionMetrics(t)
  assert.equal(s.turns, 2)
  assert.equal(s.questions, 1)
  assert.equal(s.monologues, 1)
  assert.equal(s.pressures, 1)
  assert.equal(s.meetingAsks, 1)
  assert.ok(s.repShare > 80)
  assert.equal(turningPoints(t).worst.index, 3)
  assert.equal(turningPoints(t).best, null)
})

test('trust is clamped to 0..10', () => {
  assert.equal(clampTrust(-3), 0)
  assert.equal(clampTrust(14), 10)
  assert.equal(clampTrust('6'), 6)
})
