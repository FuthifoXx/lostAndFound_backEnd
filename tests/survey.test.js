import test from 'node:test'
import assert from 'node:assert/strict'
import { validateSurvey } from '../utils/validateSurvey.js'
const valid = { experience: 'I have only heard about it', lostBefore: 'Yes', usefulness: 'Very useful', recommend: 'Maybe', interest: 'Just sharing feedback' }
test('anonymous feedback needs no identity or contact', () => {
  const result = validateSurvey({ ...valid, role: 'admin', contactConsent: true })
  assert.equal(result.contact, '')
  assert.equal(result.contactConsent, false)
  assert.equal(result.role, undefined)
})
test('required answers reject unknown values and missing fields', () => {
  for (const key of Object.keys(valid)) assert.throws(() => validateSurvey({ ...valid, [key]: 'unexpected' }))
  assert.throws(() => validateSurvey(null))
})
test('contact requires explicit boolean consent', () => {
  assert.throws(() => validateSurvey({ ...valid, contact: 'test@example.com' }))
  assert.throws(() => validateSurvey({ ...valid, contact: 'test@example.com', contactConsent: 'true' }))
  assert.equal(validateSurvey({ ...valid, contact: ' test@example.com ', contactConsent: true }).contact, 'test@example.com')
})
test('feedback length and types are bounded', () => {
  assert.throws(() => validateSurvey({ ...valid, feedback: 'a'.repeat(1001) }))
  assert.throws(() => validateSurvey({ ...valid, contact: { $ne: '' } }))
})
test('first impressions do not become app usability ratings', () => {
  assert.equal(validateSurvey({ ...valid, ease: 'Easy' }).ease, undefined)
  assert.equal(validateSurvey({ ...valid, experience: 'I have used it myself', ease: 'Easy' }).ease, 'Easy')
})
