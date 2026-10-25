import mongoose from 'mongoose'

// Database-backed limits survive restarts and work across server instances.
const schema = new mongoose.Schema({
  _id: String,
  count: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true, expires: 0 },
})
export default mongoose.model('RecoveryLimit', schema)
