import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decide, hiddenFrom, ruleFor, withLegacyHidden } from './access.js'

const agent = { name: 'ודיע' }
const manager = { name: 'איציק', isManager: true }
const admin = { name: 'מלאכי אזערי', isManager: true, isAdmin: true }
const can = (key, who, access, hidden) => decide(ruleFor(key, access, hidden), who)

test('with nothing saved, every item behaves as the app did before', () => {
  assert.equal(can('tasks', agent), true)
  assert.equal(can('agents-daily', agent), false)
  assert.equal(can('agents-daily', manager), true)
  assert.equal(can('forms.transfer', manager), false)
  assert.equal(can('forms.transfer', admin), true)
  assert.equal(can('whatsapp.ads', agent), false)
})

test('a page hidden in the old list stays hidden — for everyone, the admin too', () => {
  assert.equal(can('training', agent, {}, ['training']), false)
  assert.equal(can('training', admin, {}, ['training']), false)
  // …until the new setting says otherwise.
  assert.equal(can('training', agent, { training: { level: 'everyone' } }, ['training']), true)
})

test('levels: managers, admins, specific people', () => {
  const access = {
    reports: { level: 'managers' },
    leads: { level: 'admins' },
    whatsapp: { level: 'people', people: ['ודיע'] },
  }
  assert.equal(can('reports', agent, access), false)
  assert.equal(can('reports', manager, access), true)
  assert.equal(can('leads', manager, access), false)
  assert.equal(can('whatsapp', agent, access), true)
  assert.equal(can('whatsapp', { name: 'מרים' }, access), false)
})

test('the admin always passes — except a page hidden from everyone', () => {
  const access = { whatsapp: { level: 'people', people: [] }, 'forms.cancel': { level: 'people', people: ['ודיע'] } }
  assert.equal(can('whatsapp', admin, access), true)
  assert.equal(can('forms.cancel', admin, access), true)
  assert.equal(can('reports', admin, { reports: { level: 'nobody' } }), false)
})

test('an action cannot be "hidden from everyone", and an unknown item is for admins', () => {
  assert.equal(ruleFor('forms.cancel', { 'forms.cancel': { level: 'nobody' } }).level, 'admins')
  assert.equal(can('something-new', manager), false)
  assert.equal(can('something-new', admin), true)
  assert.equal(ruleFor('tasks', { tasks: { level: 'bogus' } }).level, 'everyone')
})

test('saving one rule keeps the pages the old list hid — hidden, not back on', () => {
  // The live list before permissions existed.
  const oldHidden = ['leads', 'speech', 'tv', 'today']
  const { access, hidden } = withLegacyHidden({ whatsapp: { level: 'people', people: ['ודיע'] } }, oldHidden)
  assert.equal(access.leads.level, 'nobody')
  assert.equal(access.today.level, 'nobody')
  assert.equal(access.whatsapp.level, 'people')
  assert.deepEqual(hidden.sort(), ['leads', 'speech', 'today', 'tv'].sort())
  assert.equal(can('leads', agent, access, hidden), false)
  // A page given its own rule is no longer forced hidden.
  const again = withLegacyHidden({ ...access, speech: { level: 'everyone' } }, hidden)
  assert.equal(again.access.speech.level, 'everyone')
  assert.ok(!again.hidden.includes('speech'))
  assert.ok(again.hidden.includes('tv'))
})

test('the old hidden list is written from the pages set to hidden', () => {
  assert.deepEqual(hiddenFrom({ tasks: { level: 'nobody' }, info: { level: 'admins' }, 'forms.cancel': { level: 'nobody' } }), ['tasks'])
})
