import assert from 'node:assert/strict'
import test from 'node:test'
import normalizePhone from '../utils/normalizePhone.js'
import { createSMSSender } from '../utils/sendSMS.js'
import Notification from '../models/Notification.js'
import service, { createNotifier } from '../services/notificationService.js'

test('phone normalization accepts supported formats and rejects malformed inputs', () => {
  for (const phone of ['065 000 0000', '+27 65 000 0000', '27650000000', '0027650000000']) {
    assert.equal(normalizePhone(phone), '+27650000000')
  }
  assert.equal(normalizePhone('+14155552671'), '+14155552671')
  for (const phone of ['', undefined, '065000', '+270650000000', '065abc0000']) {
    assert.throws(() => normalizePhone(phone))
  }
})

test('SMS sender normalizes before requesting provider and contains ambiguous outcomes', async () => {
  const calls = []
  let outcome = { sid: 'SM-test', status: 'queued' }
  const send = createSMSSender((sid, token, options) => {
    assert.equal(options.autoRetry, false)
    return { messages: { create: async payload => { calls.push(payload); return outcome } } }
  })
  await send('0650000000', 'test')
  assert.equal(calls[0].to, '+27650000000')
  await assert.rejects(send('invalid', 'test'))
  assert.equal(calls.length, 1)
  for (const response of [{}, { sid: 'SM-test', status: 'failed' }, { sid: 'SM-test', status: 'undelivered' }]) {
    outcome = response
    await assert.rejects(send('+27650000000', 'test'))
  }
})

test('match SMS overrides email, preserves claims, and records failures without losing in-app updates', async () => {
  const oldEnv = { ...process.env }
  const oldCreate = Notification.create
  const calls = []
  const records = []
  Notification.create = async data => {
    const record = { ...data, _id: 'test-note', save: async () => {} }
    records.push(record)
    return record
  }
  process.env.EMAIL_NOTIFICATIONS_ENABLED = 'true'
  process.env.MATCH_NOTIFICATION_CHANNEL = 'SMS'
  const notify = createNotifier({
    sms: createSMSSender(() => ({ messages: { create: async payload => {
      calls.push(payload)
      return { sid: 'SM-test', status: 'queued' }
    } } })),
    email: async () => { throw new Error('Email should not be selected') },
  })
  const args = {
    recipient: { _id: 'owner', phone: '0650000000' },
    item: { _id: 'item', name: 'PRIVATE-NAME' },
    type: 'MATCH_FOUND', message: 'PRIVATE-NAME', legacyChannel: 'WHATSAPP',
    text: 'We have found a match. Sign in to review it.',
  }
  try {
    const result = await notify(args)
    assert.equal(result.channel, 'SMS')
    assert.equal(result.status, 'sent')
    assert.equal(calls[0].to, '+27650000000')
    assert.match(calls[0].body, /^Back 2 Owner: We have found a match/)
    assert.doesNotMatch(calls[0].body, /PRIVATE/)
    const failed = await notify({ ...args, recipient: { _id: 'owner', phone: 'invalid' } })
    assert.equal(failed.status, 'failed')
    assert.equal(calls.length, 1)
    process.env.MATCH_NOTIFICATION_CHANNEL = 'INVALID'
    assert.equal((await notify(args)).status, 'failed')
    assert.equal(calls.length, 1)
    // Stop at persistence to inspect production selection without contacting providers.
    Notification.create = async data => { records.push(data); throw new Error('stop') }
    process.env.MATCH_NOTIFICATION_CHANNEL = 'SMS'
    await service.sendMatchNotification(args.recipient, args.item)
    assert.equal(records.at(-1).channel, 'SMS')
    assert.match(records.at(-1).message, /We have found a match/)
    await service.sendClaimRequestNotification({ ...args.item, user: args.recipient })
    assert.equal(records.at(-1).channel, 'EMAIL')
  } finally {
    Notification.create = oldCreate
    for (const key of Object.keys(process.env)) if (!(key in oldEnv)) delete process.env[key]
    Object.assign(process.env, oldEnv)
  }
})
