import mongoose from 'mongoose'
const schema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    unique: true,
  },
  email: { type: String, required: true },
  tokenHash: { type: String, required: true, unique: true },
  requestedAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true, expires: 0 },
})
export default mongoose.model('EmailVerification', schema)
