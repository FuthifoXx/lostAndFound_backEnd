import test from 'node:test'
import assert from 'node:assert/strict'
import { validateSurvey } from '../utils/validateSurvey.js'
const valid = { seenAppBefore: 'No', replacementFeeFair: 'Yes', subscribe: 'Maybe', willingToPay: 20, lostBefore: 'No', usefulness: 'Very useful', recommend: 'Maybe', interest: 'Just sharing feedback' }
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
test('conditional recovery fields are required and irrelevant answers are removed', () => {
  assert.throws(() => validateSurvey({ ...valid, lostBefore: 'Yes' }))
  assert.throws(() => validateSurvey({ ...valid, lostBefore: 'Yes', lostItem: 'ID', recovered: 'Yes' }))
  assert.equal(validateSurvey({ ...valid, lostBefore: 'Yes', lostItem: 'ID', recovered: 'Yes', recoveryMethod: 'Police station' }).recoveryMethod, 'Police station')
  assert.equal(validateSurvey({ ...valid, recoveryMethod: 'stale', recovered: 'Yes', lostItem: 'ID' }).recoveryMethod, undefined)
})
test('ratings and payment enforce numeric boundaries', () => {
  for (const value of [0, 11, 1.5, true, {}]) assert.throws(() => validateSurvey({ ...valid, queueRating: value }))
  for (const value of [19, 101, '', null, true]) assert.throws(() => validateSurvey({ ...valid, willingToPay: value }))
  assert.equal(validateSurvey({ ...valid, queueRating: '10', willingToPay: '100' }).willingToPay, 100)
  assert.equal(validateSurvey(valid).queueRating, undefined)
})
