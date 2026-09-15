import { test } from 'node:test'
import assert from 'node:assert/strict'
import { WA_DEFAULTS, fillText, waText } from './formMessages.js'

const vars = { name: 'דני כהן', templateName: 'הסכם קורס', initiator: 'ודיע', link: 'https://sign.x/sign/abc' }

test('the default WhatsApp text reads as before', () => {
  assert.equal(
    waText('wa_link', {}, vars),
    'שלום דני,\nמצורף לחתימה: הסכם קורס — מכללת R.E.S.\nלמילוי וחתימה דיגיטלית:\nhttps://sign.x/sign/abc'
  )
})

test("the office's text fills its braces; an unknown brace stays as written", () => {
  assert.equal(fillText('היי {שם מלא}, {טופס} מאת {נציג} {משהו}', vars), 'היי דני כהן, הסכם קורס מאת ודיע {משהו}')
})

test('a text without {קישור} still carries the link, at the end', () => {
  assert.equal(waText('wa_reminder', { wa_reminder: 'היי {שם}, מחכים לך' }, vars), 'היי דני, מחכים לך\nhttps://sign.x/sign/abc')
})

test('an empty saved text falls back to the default', () => {
  assert.equal(waText('wa_reminder', { wa_reminder: '   ' }, vars), fillText(WA_DEFAULTS.wa_reminder, vars))
})
