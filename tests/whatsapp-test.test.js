import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import jwt from 'jsonwebtoken'
import User from '../models/User.js'
import routes from '../routes/notificationRoutes.js'
import { createWhatsAppTestHandler } from '../controllers/whatsAppTestController.js'

test('WhatsApp diagnostic restrictions and provider outcomes', async () => {
  const oldEnv = { ...process.env }
  const oldFind = User.findById
  process.env.JWT_SECRET = 'test-only-secret'
  User.findById = id => ({ select: async () => ({ _id: id, role: id }) })
  const app = express()
  app.use('/api/notifications', routes)
  const server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  const request = role => fetch(`http://127.0.0.1:${server.address().port}/api/notifications/test-whatsapp`, {
    method: 'POST', headers: role ? { Authorization: `Bearer ${jwt.sign({ id: role }, process.env.JWT_SECRET)}` } : {},
  })
  const response = () => ({ code: 200, headers: {}, set(k, v) { this.headers[k] = v; return this },
    status(code) { this.code = code; return this }, json(body) { this.body = body; return this } })
  let clock = 100000
  const calls = []
  let outcome = { sid: 'SM-test', status: 'queued' }
  const handler = createWhatsAppTestHandler(async (...args) => {
    calls.push(args)
    if (outcome instanceof Error) throw outcome
    return outcome
  }, () => clock)
  const run = async () => { const res = response(); await handler({ body: { to: '+19999999999', message: 'override' } }, res); return res }
  try {
    process.env.WHATSAPP_TEST_ENABLED = 'true'
    assert.equal((await request()).status, 401)
    assert.equal((await request('partner')).status, 403)
    assert.equal((await request('user')).status, 403)
    process.env.WHATSAPP_TEST_ENABLED = 'false'
    assert.equal((await request('admin')).status, 404)
    assert.equal((await run()).code, 404)
    process.env.WHATSAPP_TEST_ENABLED = 'true'
    process.env.WHATSAPP_TEST_TO = 'invalid'
    assert.equal((await run()).code, 503)
    assert.equal(calls.length, 0)
    Object.assign(process.env, { TWILIO_SID: 'fake', TWILIO_AUTH_TOKEN: 'fake',
      TWILIO_WHATSAPP_NUMBER: 'whatsapp:+14155238886', WHATSAPP_TEST_TO: '+27820000000',
      EMAIL_NOTIFICATIONS_ENABLED: 'true' })
    const accepted = await run()
    assert.equal(accepted.code, 202)
    assert.equal(accepted.headers['Cache-Control'], 'private, no-store')
    assert.equal(calls[0][0], '+27820000000')
    assert.match(calls[0][1], /^Back 2 Owner:/)
    assert.ok(!calls[0][1].includes('override'))
    assert.equal((await run()).code, 429)
    assert.equal(calls.length, 1)
    for (const failure of [new Error('private provider details'), {}, { sid: 'SM-test', status: 'failed' }]) {
      clock += 60001
      outcome = failure
      const res = await run()
      assert.equal(res.code, 502)
      assert.ok(!JSON.stringify(res.body).includes('private provider details'))
    }
    assert.equal(process.env.EMAIL_NOTIFICATIONS_ENABLED, 'true')
  } finally {
    User.findById = oldFind
    for (const key of Object.keys(process.env)) if (!(key in oldEnv)) delete process.env[key]
    Object.assign(process.env, oldEnv)
    await new Promise(resolve => server.close(resolve))
  }
})
