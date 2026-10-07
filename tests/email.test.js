import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import jwt from 'jsonwebtoken'
import User from '../models/User.js'
import routes from '../routes/notificationRoutes.js'
import sendEmail from '../utils/sendEmail.js'

test('Brevo transport and protected diagnostic', async (t) => {
  const realFetch = globalThis.fetch
  const oldFind = User.findById
  const oldEnv = { ...process.env }
  process.env.JWT_SECRET = 'test-only-secret'
  process.env.NODE_ENV = 'production'
  process.env.BREVO_API_KEY = 'fake-test-key'
  process.env.EMAIL_FROM = 'business@example.com'
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options })
    return new Response(JSON.stringify({ messageId: 'test-message' }), { status: 201 })
  }
  User.findById = (id) => ({ select: async () => ({ _id: id, role: id }) })
  const app = express()
  app.use(express.json())
  app.use('/api/notifications', routes)
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  const url = `http://127.0.0.1:${server.address().port}/api/notifications/test-email`
  const request = (role, body) => realFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(role ? {
      Authorization: `Bearer ${jwt.sign({ id: role }, process.env.JWT_SECRET)}`,
    } : {}) },
    body: JSON.stringify(body || {}),
  })
  try {
    await t.test('missing authentication and non-admin roles cannot send', async () => {
      process.env.EMAIL_TEST_ENABLED = 'true'
      assert.equal((await request()).status, 401)
      assert.equal((await request('partner')).status, 403)
      assert.equal((await request('user')).status, 403)
      assert.equal(calls.length, 0)
    })
    await t.test('disabled diagnostic cannot send', async () => {
      process.env.EMAIL_TEST_ENABLED = 'false'
      assert.equal((await request('admin')).status, 404)
      assert.equal(calls.length, 0)
    })
    await t.test('fixed business recipient, accepted status, and cooldown', async () => {
      process.env.EMAIL_TEST_ENABLED = 'true'
      const res = await request('admin', { to: 'other@example.com', subject: 'override' })
      assert.equal(res.status, 202)
      assert.equal(res.headers.get('cache-control'), 'private, no-store')
      assert.equal((await res.json()).messageId, 'test-message')
      const payload = JSON.parse(calls[0].options.body)
      assert.deepEqual(payload.to, [{ email: 'business@example.com' }])
      assert.equal(payload.subject, 'Back 2 Owner production email test')
      assert.equal(calls[0].url, 'https://api.brevo.com/v3/smtp/email')
      assert.ok(calls[0].options.signal)
      assert.equal((await request('admin')).status, 429)
      assert.equal(calls.length, 1)
    })
    await t.test('provider rejection is propagated without private response content', async () => {
      globalThis.fetch = async () => new Response('private provider details', { status: 401 })
      await assert.rejects(sendEmail('business@example.com', 'test', 'test'), /HTTP 401/)
    })
    await t.test('ambiguous success and network errors are not reported as accepted', async () => {
      globalThis.fetch = async () => new Response('{}', { status: 201 })
      await assert.rejects(sendEmail('business@example.com', 'test', 'test'), /message ID/)
      globalThis.fetch = async () => { throw new Error('network failure') }
      await assert.rejects(sendEmail('business@example.com', 'test', 'test'), /network failure/)
    })
    await t.test('missing production credentials never fall back to SMTP', async () => {
      delete process.env.BREVO_API_KEY
      await assert.rejects(sendEmail('business@example.com', 'test', 'test'), /BREVO_API_KEY/)
    })
  } finally {
    globalThis.fetch = realFetch
    User.findById = oldFind
    for (const key of Object.keys(process.env)) if (!(key in oldEnv)) delete process.env[key]
    Object.assign(process.env, oldEnv)
    await new Promise((resolve) => server.close(resolve))
  }
})
