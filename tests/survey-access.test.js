import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import jwt from 'jsonwebtoken'
import User from '../models/User.js'
import SurveyResponse from '../models/SurveyResponse.js'
import surveyRoutes from '../routes/surveyRoutes.js'

test('survey submissions require an authenticated admin before writing', async () => {
  const oldSecret = process.env.JWT_SECRET
  process.env.JWT_SECRET = 'survey-test-only-secret'
  const originalFind = User.findById
  const originalCreate = SurveyResponse.create
  let writes = 0
  User.findById = id => ({ select: async () => ({ _id: id, role: id }) })
  SurveyResponse.create = async () => { writes++ }
  const app = express()
  app.use(express.json()); app.use('/surveys', surveyRoutes)
  const server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  const body = { seenAppBefore: 'No', replacementFeeFair: 'Yes', subscribe: 'Maybe', willingToPay: 20, lostBefore: 'No', usefulness: 'Very useful', recommend: 'Maybe', interest: 'Just sharing feedback' }
  try {
    const post = async role => fetch(`http://127.0.0.1:${server.address().port}/surveys`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(role ? { Authorization: `Bearer ${jwt.sign({ id: role }, process.env.JWT_SECRET)}` } : {}) }, body: JSON.stringify(body) })
    assert.equal((await post()).status, 401)
    for (const role of ['user', 'partner']) assert.equal((await post(role)).status, 403)
    assert.equal(writes, 0)
    assert.equal((await post('admin')).status, 201)
    assert.equal(writes, 1)
  } finally {
    User.findById = originalFind; SurveyResponse.create = originalCreate
    if (oldSecret === undefined) delete process.env.JWT_SECRET
    else process.env.JWT_SECRET = oldSecret
    await new Promise(resolve => server.close(resolve))
  }
})
