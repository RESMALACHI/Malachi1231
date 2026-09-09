// Tests for the calendar-title parser.
//
// Agents type these titles by hand, in half a dozen shapes, and the result is
// the name shown on the wall board, in the day planner, in the reports and on
// every deal. It drifts if nobody pins it down.
//
// Run: npm test

import test from 'node:test'
import assert from 'node:assert/strict'
import { clientName } from './meetingTitle.js'

test('the client is pulled out of a bot-written title', () => {
  assert.equal(
    clientName('פגישת זום - רון וררגה - מלאכי אזערי', 'מלאכי אזערי'),
    'רון וררגה'
  )
  assert.equal(
    clientName('פגישה פרונטלית - יגל כהן - מלאכי אזערי', 'מלאכי אזערי'),
    'יגל כהן'
  )
})

test('the status word is dropped', () => {
  assert.equal(
    clientName('פגישת זום - רון וררגה - מלאכי אזערי - אישר', 'מלאכי אזערי'),
    'רון וררגה'
  )
  assert.equal(clientName('פגישת זום - ליאור - עדי אישר', 'עדי'), 'ליאור')
})

// The confirmation date agents append after "אישר". These are the exact titles
// that reached the deals table and were printed, whole, on the board.
test('the confirmation date is dropped, in every shape it is written', () => {
  const cases = [
    ['פגישה פרונטלית - מוחמד סעאידה - מלאכי אזערי - אישר 3.9', 'מלאכי אזערי', 'מוחמד סעאידה'],
    ['פגישה פרונטלית - ליאור ביטון - מלאכי אזערי-אישר 3.9.26', 'מלאכי אזערי', 'ליאור ביטון'],
    ['פגישה פרונטלית - יגל כהן - מלאכי אזערי - אישר 26', 'מלאכי אזערי', 'יגל כהן'],
    ['פגישה פרונטלית - עומר - ודיע-אישר 31/8', 'ודיע', 'עומר'],
    ['פגישה פרונטלית - מנסור אשקר - ודיע-אישר 31/08', 'ודיע', 'מנסור אשקר'],
    ['פגישה פרונטלית - רועי חגג - ויטלי - אישר 25.8.26', 'ויטלי', 'רועי חגג'],
    ['פגישה פרונטלית - רחל ירדני - מלאכי אזערי - אישרה 26', 'מלאכי אזערי', 'רחל ירדני'],
  ]
  for (const [title, agent, want] of cases) {
    assert.equal(clientName(title, agent), want, title)
  }
})

test('a name that is already clean is left exactly alone', () => {
  for (const n of ['משפחת ברקוביץ', 'אור פלח', 'קרן שדה', 'דני כהן', 'שרה פרבר']) {
    assert.equal(clientName(n, 'מלאכי אזערי'), n)
  }
})

test('a digit inside a name is not a date and is kept', () => {
  assert.equal(clientName('בן 2 דלתות', null), 'בן 2 דלתות')
})

test('the agent is removed by any spelling, not just the canonical one', () => {
  // Old titles still say "וודיע" while the roster says "ודיע".
  assert.equal(clientName('פגישת ייעוץ וודיע - דיאנה זאיד', 'ודיע'), 'דיאנה זאיד')
})

test('the phone number is not part of the name', () => {
  assert.equal(clientName('פגישת זום - דני כהן 0501234567', null), 'דני כהן')
})

test('a title with nothing left says so rather than returning empty', () => {
  assert.equal(clientName('', null), '(ללא פרטים)')
  assert.equal(clientName('פגישת זום', null), '(ללא פרטים)')
})

// Every one of these was found stranded on a real client's name in the deals
// table, which is where the wall board reads from.
test('the other status scribbles are dropped too', () => {
  const cases = [
    ['פגישה פרונטלית - סאלח עומר - ודיע-הגיע', 'ודיע', 'סאלח עומר'],
    ['פגישה פרונטלית - חגית - מלאכי אזערי - אישרה היום 2.8.26', 'מלאכי אזערי', 'חגית'],
    ['פגישת זום - שחר - מלאכי אזערי-נקבע היום 19.7', 'מלאכי אזערי', 'שחר'],
    ['פגישת ייעוץ ודיע - סלים אבו סעדה - ר"ג-אישר ההיום 19.7', 'ודיע', 'סלים אבו סעדה'],
  ]
  for (const [title, agent, want] of cases) {
    assert.equal(clientName(title, agent), want, title)
  }
})

test('a trailing separator left by an empty status is cleaned up', () => {
  assert.equal(
    clientName('פגישה פרונטלית - בשאר סכניני - מלאכי אזערי - ', 'מלאכי אזערי'),
    'בשאר סכניני'
  )
})
