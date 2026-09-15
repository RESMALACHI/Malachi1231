import { test } from 'node:test'
import assert from 'node:assert/strict'
import { closedByDeal } from './dealTasks.js'

const m = (id, title, description = '') => ({ id, title, description })

test('the meeting a deal was recorded against leaves the tasks', () => {
  const tasks = [m('a', 'דני כהן 0501234567'), m('b', 'תמר לוי 0529876543')]
  assert.deepEqual([...closedByDeal(tasks, [m('a', 'דני כהן 0501234567')])], ['a'])
})

test("the same client's other meetings go too — matched by phone, however it was typed", () => {
  const tasks = [
    m('first', 'פגישה ראשונה דני 050-123-4567'),
    m('noshow', 'דני — לא הגיע', 'טלפון: 501234567'),
    m('other', 'תמר 0529876543'),
  ]
  const closed = closedByDeal(tasks, [m('second', 'פגישה שנייה דני 0501234567')])
  assert.deepEqual([...closed].sort(), ['first', 'noshow'])
})

test('a name alone never closes a task', () => {
  const tasks = [m('x', 'דני כהן')]
  assert.equal(closedByDeal(tasks, [m('y', 'דני כהן')]).size, 0)
})

test('no deals, nothing closed', () => {
  assert.equal(closedByDeal([m('a', 'דני 0501234567')], []).size, 0)
})
