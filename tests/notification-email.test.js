import assert from 'node:assert/strict'
import test from 'node:test'
import Notification from '../models/Notification.js'
import service from '../services/notificationService.js'

test('lifecycle email recipient, privacy, and failure handling', async (t) => {
  const originalFetch = globalThis.fetch
  const originalCreate = Notification.create
  const originalEnv = { ...process.env }
  const calls = []
  const records = []
  const owner = { _id: 'owner', email: 'owner@example.com' }
  const partner = { _id: 'partner', email: 'partner@example.com' }
  const item = {
    _id: 'item', name: 'PRIVATE-DOCUMENT-NAME',
    documentNumber: 'PRIVATE-NUMBER', image: 'https://private.example/image',
    user: partner, matchedUser: owner,
  }
  const success = async (url, options) => {
    assert.equal(url, 'https://api.brevo.com/v3/smtp/email')
    calls.push(JSON.parse(options.body))
    return new Response(JSON.stringify({ messageId: 'accepted' }), { status: 201 })
  }
  process.env.EMAIL_NOTIFICATIONS_ENABLED = 'true'
  process.env.BREVO_API_KEY = 'test-only-key'
  process.env.EMAIL_FROM = 'business@example.com'
  globalThis.fetch = success
  Notification.create = async (data) => {
    const record = { ...data, _id: 'notification', save: async () => {} }
    records.push(record)
    return record
  }
  try {
    for (const [method, args, recipient, type] of [
      ['sendMatchNotification', [owner, item], owner, 'MATCH_FOUND'],
      ['sendClaimRequestNotification', [item], partner, 'CLAIM_REQUEST'],
      ['sendClaimApprovedNotification', [item], owner, 'CLAIM_APPROVED'],
      ['sendClaimRejectedNotification', [item], owner, 'CLAIM_REJECTED'],
    ]) {
      await t.test(type, async () => {
        const record = await service[method](...args)
        assert.equal(record.user, recipient._id)
        assert.equal(record.type, type)
        assert.equal(record.channel, 'EMAIL')
        assert.equal(record.status, 'sent')
        assert.ok(record.sentAt instanceof Date)
        const payload = calls.at(-1)
        assert.deepEqual(payload.to, [{ email: recipient.email }])
        assert.doesNotMatch(JSON.stringify(payload), /PRIVATE-|private.example/)
      })
    }
    await t.test('provider rejection keeps failed in-app record and does not throw', async () => {
      globalThis.fetch = async () => new Response('{}', { status: 401 })
      const record = await service.sendMatchNotification(owner, item)
      assert.equal(record.status, 'failed')
      assert.equal(record.sentAt, undefined)
      assert.equal(records.at(-1), record)
    })
    await t.test('timeout is contained without retry', async () => {
      let attempts = 0
      globalThis.fetch = async () => { attempts++; throw new DOMException('timeout', 'TimeoutError') }
      assert.equal((await service.sendClaimApprovedNotification(item)).status, 'failed')
      assert.equal(attempts, 1)
    })
    await t.test('missing recipient email makes no network request', async () => {
      globalThis.fetch = success
      const before = calls.length
      assert.equal((await service.sendMatchNotification({ _id: 'no-email' }, item)).status, 'failed')
      assert.equal(calls.length, before)
    })
    await t.test('record creation failure does not send or break lifecycle', async () => {
      Notification.create = async () => { throw new Error('database unavailable') }
      const before = calls.length
      assert.equal(await service.sendMatchNotification(owner, item), null)
      assert.equal(calls.length, before)
    })
    await t.test('disabled email retains previous channel selection', async () => {
      process.env.EMAIL_NOTIFICATIONS_ENABLED = 'false'
      const channels = []
      // Stop at persistence so this test cannot call real legacy providers.
      Notification.create = async (data) => { channels.push(data.channel); throw new Error('stop') }
      const before = calls.length
      await service.sendMatchNotification(owner, item)
      await service.sendClaimRequestNotification(item)
      assert.deepEqual(channels, ['WHATSAPP', 'SMS'])
      assert.equal(calls.length, before)
    })
  } finally {
    globalThis.fetch = originalFetch
    Notification.create = originalCreate
    for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key]
    Object.assign(process.env, originalEnv)
  }
})
