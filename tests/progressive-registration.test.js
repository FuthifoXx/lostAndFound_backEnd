import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import User from '../models/User.js'
import LostItem from '../models/LostItem.js'
import EmailVerification from '../models/EmailVerification.js'
import LossReport from '../models/LossReport.js'
import RecoveryLimit from '../models/RecoveryLimit.js'
import notificationService from '../services/notificationService.js'
import routes from '../routes/authRoutes.js'
import protect from '../middleware/authMiddleware.js'
import optionalAuth from '../middleware/optionalAuthMiddleware.js'
import {
  requestClaim,
  approveClaim,
} from '../controllers/lostItemsController.js'
import {
  parseRecoveryProfile,
  possibleFilter,
  safeProfile,
} from '../utils/recoveryProfile.js'
import { findMatchingUser } from '../utils/matchUser.js'

test('recovery input validation and privacy boundaries', async (t) => {
  const base = {
    consent: true,
    mode: 'possible',
    identityType: 'PASSPORT',
    firstNames: 'Sample Tester',
    surname: 'Example',
    dateOfBirth: '1990-01-02',
  }
  assert.equal(parseRecoveryProfile(base).mode, 'possible')
  for (const patch of [
    { consent: false },
    { dateOfBirth: '1990-02-30' },
    { dateOfBirth: '' },
    { firstNames: { $ne: '' } },
    { mode: 'unknown' },
    { identityType: 'invalid' },
    { dateOfBirth: '2990-01-02' },
  ])
    assert.throws(() => parseRecoveryProfile({ ...base, ...patch }))
  assert.throws(() =>
    parseRecoveryProfile({ ...base, mode: 'exact', passportNumber: '' }),
  )
  const exact = parseRecoveryProfile({
    ...base,
    mode: 'exact',
    passportNumber: ' test-doc ',
    role: 'admin',
  })
  assert.deepEqual(exact.identityFilter, {
    identityType: 'PASSPORT',
    passportNumber: 'TEST-DOC',
  })
  assert.equal(exact.data.role, undefined)
  assert.equal(
    possibleFilter({
      ...base,
      firstNames: ['Sample'],
      emailVerifiedAt: null,
      candidateMatching: true,
    }),
    null,
  )
  const user = {
    ...base,
    firstNames: ['Sample'],
    emailVerifiedAt: new Date(),
    candidateMatching: true,
    passportNumber: 'SECRET',
    idNumber: 'SECRET',
    password: 'HASH',
    authVersion: 2,
  }
  const filter = possibleFilter(user)
  assert.equal(filter.status, 'approved')
  assert.equal(filter.matchedUser, null)
  const safe = safeProfile(user)
  for (const key of [
    'passportNumber',
    'idNumber',
    'documentNumber',
    'password',
    'authVersion',
  ])
    assert.equal(safe[key], undefined)
  await t.test(
    'basic accounts validate without a document, legal names or phone',
    async () => {
      const doc = new User({
        displayName: 'Alias',
        email: 'alias@example.invalid',
        password: 'hash',
        matchingActive: false,
      })
      await doc.validate()
      assert.equal(doc.idNumber, undefined)
      assert.equal(doc.identityType, undefined)
      for (const identityType of ['RSA_ID', 'PASSPORT', 'OTHER'])
        await new User({
          email: 'alias@example.invalid',
          password: 'hash',
          identityType,
          matchingActive: false,
          candidateMatching: true,
        }).validate()
    },
  )
})

test('progressive registration HTTP lifecycle', async (t) => {
  const restore = []
  const stub = (object, key, value) => {
    restore.push(() => {
      object[key] = value
    })
    object[key] = value
  }
  const oldEnv = { ...process.env },
    realFetch = globalThis.fetch
  Object.assign(process.env, {
    JWT_SECRET: 'progressive-test',
    FRONTEND_URL: 'https://back-2-owner.vercel.app',
    BREVO_API_KEY: 'fake',
    EMAIL_FROM: 'test@example.invalid',
    NODE_ENV: 'production',
  })
  const users = [],
    reports = [],
    mails = []
  let record,
    notifications = 0
  let current
  const approved = {
    claimStatus: 'none',
    partner: 'test-partner',
    populate: async () => {},
    save: async () => {},
    toObject() {
      return { ...this }
    },
    _id: '507f1f77bcf86cd799439099',
    status: 'approved',
    approved: true,
    matchedUser: null,
    identityType: 'PASSPORT',
    passportNumber: 'SYNTHETIC-TEST',
    name: 'SECRET NAME',
    image: 'SECRET IMAGE',
  }
  stub(User, 'exists', async (query) =>
    users.some((u) =>
      query.email
        ? u.email === query.email
        : u.identityType === query.identityType &&
          u.passportNumber === query.passportNumber &&
          String(u._id) !== String(query._id?.$ne),
    ),
  )
  stub(User, 'create', async (data) => {
    const user = {
      ...data,
      _id: '507f1f77bcf86cd799439011',
      firstNames: [],
      authVersion: 0,
    }
    users.push(user)
    current = user
    return user
  })
  stub(
    User,
    'findOne',
    async (query) =>
      users.find((u) =>
        query.email
          ? u.email === query.email
          : u.identityType === query.identityType &&
            u.passportNumber === query.passportNumber &&
            u.matchingActive !== false,
      ) || null,
  )
  stub(User, 'findById', (id) => ({
    select: async () => users.find((u) => String(u._id) === String(id)),
  }))
  stub(User, 'findOneAndUpdate', async (query, update) => {
    const user = users.find(
      (u) =>
        String(u._id) === String(query._id) &&
        (!query.email || u.email === query.email) &&
        (!query.emailVerifiedAt || u.emailVerifiedAt === query.emailVerifiedAt),
    )
    if (!user) return null
    Object.assign(user, update.$set)
    for (const key of Object.keys(update.$unset || {})) delete user[key]
    return user
  })
  stub(RecoveryLimit, 'findOneAndUpdate', async () => ({ count: 1 }))
  stub(EmailVerification, 'findOneAndUpdate', async (query, update) => {
    if (record && record.requestedAt >= query.requestedAt.$lt) {
      const error = new Error('duplicate')
      error.code = 11000
      throw error
    }
    record = { userId: query.userId, ...update.$set }
    return record
  })
  stub(EmailVerification, 'findOneAndDelete', async (query) => {
    if (
      !record ||
      record.tokenHash !== query.tokenHash ||
      record.expiresAt <= query.expiresAt.$gt
    )
      return null
    const found = record
    record = null
    return found
  })
  stub(LostItem, 'find', (query) => ({
    select: () => ({
      limit: () => ({ lean: async () => [approved] }),
      then: (resolve) =>
        resolve(
          approved.status === 'approved' &&
            query.passportNumber === 'SYNTHETIC-TEST'
            ? [approved]
            : [],
        ),
    }),
  }))
  stub(LostItem, 'findOneAndUpdate', async (query, update) => {
    if (approved.status !== 'approved' || approved.matchedUser) return null
    Object.assign(approved, update.$set)
    return approved
  })
  stub(LostItem, 'findById', () => ({
    select: async () => approved,
    then: (resolve) => resolve(approved),
  }))
  stub(notificationService, 'sendClaimRequestNotification', async () => {})
  stub(notificationService, 'sendClaimApprovedNotification', async () => {})
  stub(notificationService, 'sendMatchNotification', async () => {
    notifications++
  })
  stub(LossReport, 'countDocuments', async () => reports.length)
  stub(LossReport, 'create', async (data) => {
    const report = { ...data, _id: 'report1' }
    reports.push(report)
    return report
  })
  stub(LossReport, 'find', (query) => ({
    sort: () => ({
      limit: async () => reports.filter((r) => r.user === query.user),
    }),
  }))
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.brevo.com/v3/smtp/email')
    mails.push(JSON.parse(options.body))
    return new Response(JSON.stringify({ messageId: 'fake-id' }), {
      status: 201,
    })
  }
  const app = express()
  app.use(express.json())
  app.use('/api/auth', routes)
  app.put('/api/auth/items/:id/claim', protect, requestClaim)
  app.put('/api/auth/items/:id/approve-claim', protect, approveClaim)
  app.get('/api/auth/private-check', optionalAuth, (req, res) =>
    res.json({ private: Boolean(req.user) }),
  )
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  const base = `http://127.0.0.1:${server.address().port}/api/auth`
  const request = async (
    path,
    body,
    authenticated = false,
    method = body ? 'POST' : 'GET',
  ) => {
    const headers = { 'Content-Type': 'application/json' }
    if (authenticated)
      headers.Authorization = `Bearer ${jwt.sign({ id: current._id }, process.env.JWT_SECRET)}`
    const response = await realFetch(base + path, {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    return {
      status: response.status,
      body: await response.json(),
      headers: response.headers,
    }
  }
  const matching = {
    consent: true,
    mode: 'possible',
    identityType: 'PASSPORT',
    firstNames: 'Sample Tester',
    surname: 'Example',
    dateOfBirth: '1990-01-02',
  }
  try {
    await t.test(
      'signup stores only basic account fields; contact email requires confirmation',
      async () => {
        const response = await request('/register', {
          displayName: 'Pilot Alias',
          email: ' ALIAS@EXAMPLE.INVALID ',
          password: 'strong-password',
          idNumber: 'SHOULD-NOT-STORE',
          identityType: 'RSA_ID',
          surname: 'Secret',
          phone: 'SHOULD-NOT-STORE',
          role: 'admin',
        })
        assert.equal(response.status, 201)
        assert.equal(current.email, 'alias@example.invalid')
        assert.equal(current.role, 'user')
        assert.equal(current.idNumber, undefined)
        assert.equal(current.surname, undefined)
        assert.equal(current.phone, undefined)
        assert.equal(current.matchingActive, false)
        assert.ok(await bcrypt.compare('strong-password', current.password))
        assert.equal(mails.length, 1)
        assert.ok(mails[0].textContent.includes('verify-email#'))
        assert.ok(!JSON.stringify(response.body).includes(record.tokenHash))
        assert.equal(
          (await request('/recovery-profile', matching, true, 'PUT')).status,
          403,
        )
        assert.equal(
          (await request('/recovery-profile', matching, false, 'PUT')).status,
          401,
        )
      },
    )
    await t.test(
      'email confirmation is hashed, expiring, email-bound and single-use',
      async () => {
        const token = mails[0].textContent.match(
          /verify-email#([a-f0-9]{64})/,
        )[1]
        assert.notEqual(token, record.tokenHash)
        assert.equal(
          (await request('/verify-email', { token: 'wrong' })).status,
          400,
        )
        const date = record.expiresAt
        record.expiresAt = new Date(0)
        assert.equal((await request('/verify-email', { token })).status, 400)
        record.expiresAt = date
        const email = current.email
        current.email = 'changed@example.invalid'
        assert.equal((await request('/verify-email', { token })).status, 400)
        assert.equal(current.emailVerifiedAt, undefined)
        current.email = email
        record = null
        await request('/email-confirmation', {}, true)
        const replacement = mails
          .at(-1)
          .textContent.match(/verify-email#([a-f0-9]{64})/)[1]
        assert.equal(
          (await request('/verify-email', { token: replacement })).status,
          200,
        )
        assert.ok(current.emailVerifiedAt)
        assert.equal(
          (await request('/verify-email', { token: replacement })).status,
          400,
        )
      },
    )
    await t.test(
      'possible matches disclose no document data and never assign an owner',
      async () => {
        assert.equal(
          (await request('/recovery-profile', matching, true, 'PUT')).status,
          200,
        )
        const response = await request('/possible-matches', null, true)
        assert.equal(response.status, 200)
        assert.deepEqual(Object.keys(response.body.items[0]).sort(), [
          'documentType',
          'reference',
          'status',
        ])
        assert.equal(response.body.items[0].status, 'possible')
        assert.ok(!JSON.stringify(response.body).includes('SECRET'))
        assert.equal(approved.matchedUser, null)
        assert.equal(notifications, 0)
      },
    )
    await t.test(
      'exact enrollment links earlier approved items once and preserves existing cases',
      async () => {
        const response = await request(
          '/recovery-profile',
          { ...matching, mode: 'exact', passportNumber: 'SYNTHETIC-TEST' },
          true,
          'PUT',
        )
        assert.equal(response.status, 200)
        assert.equal(response.body.matchedItems, 1)
        assert.equal(approved.matchedUser, current._id)
        assert.equal(approved.status, 'matched')
        assert.equal(notifications, 1)
        assert.equal(response.body.passportNumber, undefined)
        assert.equal(response.body.exactMatching, true)
        const again = await request(
          '/recovery-profile',
          { ...matching, mode: 'exact', passportNumber: 'SYNTHETIC-TEST' },
          true,
          'PUT',
        )
        assert.equal(again.status, 200)
        assert.equal(notifications, 1)
        assert.equal(
          (
            await request(
              '/recovery-profile',
              { ...matching, mode: 'exact', passportNumber: 'DIFFERENT' },
              true,
              'PUT',
            )
          ).status,
          409,
        )
        assert.equal(
          (await request('/me', null, true)).body.passportNumber,
          undefined,
        )
      },
    )
    await t.test(
      'duplicate document enrollment cannot steal another account’s match',
      async () => {
        const owner = current
        current = {
          _id: '507f1f77bcf86cd799439022',
          email: 'other@example.invalid',
          emailVerifiedAt: new Date(),
          authVersion: 0,
          matchingActive: false,
        }
        users.push(current)
        assert.equal(
          (
            await request(
              '/recovery-profile',
              { ...matching, mode: 'exact', passportNumber: 'SYNTHETIC-TEST' },
              true,
              'PUT',
            )
          ).status,
          409,
        )
        assert.equal(approved.matchedUser, owner._id)
        current = owner
      },
    )
    await t.test(
      'reports belong to authenticated account, not supplied owner IDs',
      async () => {
        assert.equal(
          (await request('/loss-reports', { itemType: 'Wallet' }, false))
            .status,
          401,
        )
        const report = await request(
          '/loss-reports',
          { itemType: 'Wallet', area: 'Test area', user: 'other-account' },
          true,
        )
        assert.equal(report.status, 201)
        assert.equal(report.body.user, current._id)
        const response = await request('/loss-reports', null, true)
        assert.equal(response.body.length, 1)
        assert.equal(response.headers.get('cache-control'), 'private, no-store')
      },
    )
    await t.test(
      'enrolled account can claim, another candidate cannot, partner approves',
      async () => {
        const owner = current
        current = users[1]
        assert.equal(
          (await request('/items/' + approved._id + '/claim', {}, true, 'PUT'))
            .status,
          403,
        )
        current = owner
        assert.equal(
          (await request('/items/' + approved._id + '/claim', {}, true, 'PUT'))
            .status,
          200,
        )
        assert.equal(approved.claimStatus, 'pending')
        const partner = {
          _id: '507f1f77bcf86cd799439033',
          role: 'partner',
          partner: 'test-partner',
        }
        users.push(partner)
        current = partner
        assert.equal(
          (
            await request(
              '/items/' + approved._id + '/approve-claim',
              {},
              true,
              'PUT',
            )
          ).status,
          200,
        )
        assert.equal(approved.status, 'claimed')
        assert.equal(approved.claimStatus, 'approved')
        current = owner
      },
    )
    await t.test(
      'revoked sessions cannot access private item-detail state',
      async () => {
        current.authVersion = 1
        const response = await request('/private-check', null, true)
        assert.equal(response.status, 401)
        current.authVersion = 0
      },
    )
    await t.test(
      'legacy exact matching survives for users without new enrollment flags',
      async () => {
        delete current.matchingActive
        assert.equal(
          (
            await findMatchingUser({
              identityType: 'PASSPORT',
              passportNumber: 'SYNTHETIC-TEST',
            })
          )._id,
          current._id,
        )
        current.matchingActive = false
        assert.equal(
          await findMatchingUser({
            identityType: 'PASSPORT',
            passportNumber: 'SYNTHETIC-TEST',
          }),
          null,
        )
      },
    )
  } finally {
    for (const reset of restore.reverse()) reset()
    globalThis.fetch = realFetch
    for (const key of Object.keys(process.env))
      if (!(key in oldEnv)) delete process.env[key]
    Object.assign(process.env, oldEnv)
    await new Promise((resolve) => server.close(resolve))
  }
})
