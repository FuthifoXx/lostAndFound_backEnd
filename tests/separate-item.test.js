import assert from 'node:assert/strict'
import test from 'node:test'
import LostItem from '../models/LostItem.js'
import { addLostItem } from '../controllers/lostItemsController.js'

test('active document cases require explicit separate-item confirmation', async () => {
  const originalFind = LostItem.findOne
  const originalCreate = LostItem.create
  const queries = []
  const uploads = []
  let existing = { _id: 'existing', status: 'matched' }
  LostItem.findOne = query => ({ select: async () => { queries.push(query); return existing } })
  LostItem.create = async data => { uploads.push(data); return { toObject: () => ({ ...data, _id: 'new' }) } }
  const run = async (identity, confirmation) => {
    const req = { user: { _id: 'partner-user', partner: 'partner' }, body: {
      name: 'Separate item', description: 'Test item', location: 'Test location',
      dateLost: '2026-10-08', ...identity, confirmSeparateItem: confirmation,
    } }
    const res = { code: 200, status(code) { this.code = code; return this }, json(body) { this.body = body; return this } }
    await addLostItem(req, res)
    return res
  }
  try {
    for (const identity of [
      { identityType: 'RSA_ID', idNumber: 'TEST-ID' },
      { identityType: 'PASSPORT', passportNumber: 'TEST-PASSPORT' },
      { identityType: 'OTHER', documentNumber: 'TEST-OTHER' },
    ]) {
      for (const confirmation of [undefined, false, 'false', 'yes', '1']) {
        const res = await run(identity, confirmation)
        assert.equal(res.code, 409)
        assert.equal(res.body.code, 'ACTIVE_DOCUMENT_CASE')
      }
      const count = uploads.length
      for (const confirmation of [true, 'true']) {
        const res = await run(identity, confirmation)
        assert.equal(res.code, 201)
        assert.equal(res.body.separateItemConfirmed, true)
      }
      assert.equal(uploads.length, count + 2)
      assert.deepEqual(queries.at(-1).status.$in, ['pending', 'approved', 'matched', 'claimed'])
      existing = null
      const fresh = await run(identity)
      assert.equal(fresh.code, 201)
      assert.equal(fresh.body.separateItemConfirmed, false)
      existing = { _id: 'existing', status: 'matched' }
    }
  } finally {
    LostItem.findOne = originalFind
    LostItem.create = originalCreate
  }
})
