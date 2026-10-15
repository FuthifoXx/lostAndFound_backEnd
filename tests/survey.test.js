import test from 'node:test'
import assert from 'node:assert/strict'
import { validateSurvey } from '../utils/validateSurvey.js'
const valid = { seenAppBefore: 'No', researchConsent: true, keepInTouch: 'No', replacementFeeFair: 'Yes', subscribe: 'Maybe', willingToPay: 20, lostBefore: 'No', usefulness: 'Very useful', recommend: 'Maybe', interest: 'Just sharing feedback' }
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
test('follow-up choice controls contact storage and consent is explicit', () => {
  assert.throws(() => validateSurvey({ ...valid, researchConsent: false }))
  assert.throws(() => validateSurvey({ ...valid, researchConsent: 'true' }))
  assert.throws(() => validateSurvey({ ...valid, keepInTouch: 'Yes' }))
  assert.equal(validateSurvey({ ...valid, contact: 'stale@example.com' }).contact, '')
  assert.equal(validateSurvey({ ...valid, keepInTouch: 'Yes', contact: ' test@example.com ' }).contact, 'test@example.com')
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
  for (const value of [-1, 1.234, '', null, true]) assert.throws(() => validateSurvey({ ...valid, willingToPay: value }))
  assert.equal(validateSurvey({ ...valid, queueRating: '10', willingToPay: '100' }).willingToPay, 100)
  assert.equal(validateSurvey(valid).queueRating, undefined)
})

test('comfort factors are allowlisted and Other requires details', () => {
  assert.throws(() => validateSurvey({ ...valid, comfortFactors: ['unknown'] }))
  assert.throws(() => validateSurvey({ ...valid, comfortFactors: ['Other'] }))
  assert.equal(validateSurvey({ ...valid, comfortFactors: ['Other'], comfortOther: 'Local support' }).comfortOther, 'Local support')
  assert.equal(validateSurvey({ ...valid, willingToPay: 150 }).willingToPay, 150)
  assert.equal(validateSurvey({ ...valid, replacementFeeFair: 'Not sure' }).replacementFeeFair, 'Not sure')
})
