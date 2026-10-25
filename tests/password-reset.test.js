import assert from 'node:assert/strict'
import test from 'node:test'
import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import express from 'express'
import jwt from 'jsonwebtoken'
import User from '../models/User.js'
import PasswordReset from '../models/PasswordReset.js'
import RecoveryLimit from '../models/RecoveryLimit.js'
import routes from '../routes/authRoutes.js'

// Exercise HTTP routes and the real mail transport, with database/provider boundaries stubbed.
test('password recovery lifecycle', async (t) => {
  const original = { fetch: globalThis.fetch, env: { ...process.env },
    userFind: User.findOne, userUpdate: User.findOneAndUpdate, userById: User.findById,
    resetUpdate: PasswordReset.findOneAndUpdate, resetFind: PasswordReset.findOne,
    resetDelete: PasswordReset.findOneAndDelete, limit: RecoveryLimit.findOneAndUpdate }
  const user = { _id: '507f1f77bcf86cd799439011', email: 'volunteer@example.com',
    password: await bcrypt.hash('original-password', 10), authVersion: 0 }
  let record, count = 0, emails = [], providerFails = false
  User.findOne = async ({ email }) => email === user.email ? user : null
  User.findById = () => ({ select: async () => user })
  User.findOneAndUpdate = async (filter, update) => {
    assert.equal(String(filter._id), user._id)
    user.password = update.$set.password
    user.authVersion++
    return user
  }
  RecoveryLimit.findOneAndUpdate = async () => ({ count: ++count })
  PasswordReset.findOneAndUpdate = async (filter, update) => {
    if (record && record.requestedAt >= filter.requestedAt.$lt) {
      const error = new Error('duplicate'); error.code = 11000; throw error
    }
    record = { userId: filter.userId, ...update.$set }
    return record
  }
  const eligible = (filter) => record && record.tokenHash === filter.tokenHash && record.expiresAt > filter.expiresAt.$gt
  PasswordReset.findOne = async (filter) => eligible(filter) ? { ...record } : null
  PasswordReset.findOneAndDelete = async (filter) => {
    if (!eligible(filter)) return null
    const result = record; record = null; return result
  }
  Object.assign(process.env, { FRONTEND_URL: 'https://back-2-owner.vercel.app',
    BREVO_API_KEY: 'test-key', EMAIL_FROM: 'test@example.com', JWT_SECRET: 'test-secret', NODE_ENV: 'production' })
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.brevo.com/v3/smtp/email')
    emails.push(JSON.parse(options.body))
    return new Response(JSON.stringify({ messageId: 'test-mail' }), { status: providerFails ? 500 : 201 })
  }
  const app = express(); app.use(express.json()); app.use('/api/auth', routes)
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  const base = `http://127.0.0.1:${server.address().port}/api/auth`
  const post = async (path, body) => {
    const res = await original.fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    return { status: res.status, body: await res.json(), headers: res.headers }
  }
  const tokenFromMail = () => emails.at(-1).textContent.match(/reset-password#([a-f0-9]{64})/)[1]
  try {
    await t.test('normalizes email, hides account existence, hashes token and throttles repeat emails', async () => {
      const unknown = await post('/forgot-password', { email: 'missing@example.com' })
      const known = await post('/forgot-password', { email: ' VOLUNTEER@EXAMPLE.COM ' })
      assert.deepEqual(known.body, unknown.body)
      assert.equal(known.status, 200)
      assert.equal(known.headers.get('cache-control'), 'no-store')
      assert.equal(emails.length, 1)
      const token = tokenFromMail()
      assert.equal(record.tokenHash, crypto.createHash('sha256').update(token).digest('hex'))
      assert.ok(record.expiresAt - record.requestedAt === 30 * 60 * 1000)
      assert.ok(!JSON.stringify(known.body).includes(token))
      await post('/forgot-password', { email: user.email })
      assert.equal(emails.length, 1)
    })
    await t.test('rejects weak password, malformed, wrong and expired tokens', async () => {
      const token = tokenFromMail()
      assert.equal((await post('/reset-password', { token, password: 'short' })).status, 400)
      assert.equal((await post('/reset-password', { token: 'bad', password: 'new-password' })).status, 400)
      assert.equal((await post('/reset-password', { token: 'a'.repeat(64), password: 'new-password' })).status, 400)
      const expiresAt = record.expiresAt; record.expiresAt = new Date(0)
      assert.equal((await post('/reset-password', { token, password: 'new-password' })).status, 400)
      record.expiresAt = expiresAt
      assert.ok(await bcrypt.compare('original-password', user.password))
    })
    await t.test('only one concurrent reset succeeds; old password and login token stop working', async () => {
      const oldJwt = jwt.sign({ id: user._id, authVersion: 0 }, process.env.JWT_SECRET)
      const token = tokenFromMail()
      const results = await Promise.all([post('/reset-password', { token, password: 'new-secure-password' }), post('/reset-password', { token, password: 'new-secure-password' })])
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 400])
      assert.ok(await bcrypt.compare('new-secure-password', user.password))
      assert.ok(!await bcrypt.compare('original-password', user.password))
      assert.equal((await post('/reset-password', { token, password: 'another-password' })).status, 400)
      const profile = await original.fetch(base + '/me', { headers: { Authorization: `Bearer ${oldJwt}` } })
      assert.equal(profile.status, 401)
      assert.equal((await post('/login', { email: user.email, password: 'original-password' })).status, 401)
      const login = await post('/login', { email: ' VOLUNTEER@EXAMPLE.COM ', password: 'new-secure-password' })
      assert.equal(login.status, 200)
      assert.equal(jwt.verify(login.body.token, process.env.JWT_SECRET).authVersion, 1)
    })
    await t.test('provider failure does not disclose account or return reset secret', async () => {
      providerFails = true
      const known = await post('/forgot-password', { email: user.email })
      const unknown = await post('/forgot-password', { email: 'missing@example.com' })
      assert.equal(known.status, 200)
      assert.deepEqual(known.body, unknown.body)
    })
    await t.test('rate limit applies to recovery requests', async () => {
      count = 20
      const response = await post('/forgot-password', { email: user.email })
      assert.equal(response.status, 429)
      assert.equal(response.headers.get('retry-after'), '900')
    })
  } finally {
    globalThis.fetch = original.fetch
    User.findOne = original.userFind; User.findOneAndUpdate = original.userUpdate; User.findById = original.userById
    PasswordReset.findOneAndUpdate = original.resetUpdate; PasswordReset.findOne = original.resetFind; PasswordReset.findOneAndDelete = original.resetDelete
    RecoveryLimit.findOneAndUpdate = original.limit
    for (const key of Object.keys(process.env)) if (!(key in original.env)) delete process.env[key]
    Object.assign(process.env, original.env)
    await new Promise((resolve) => server.close(resolve))
  }
})
