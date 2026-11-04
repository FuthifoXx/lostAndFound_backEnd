import mongoose from 'mongoose'
const schema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    itemType: { type: String, required: true, maxlength: 80 },
    area: { type: String, maxlength: 120 },
    details: { type: String, maxlength: 500 },
    dateLost: Date,
  },
  { timestamps: true },
)
export default mongoose.model('LossReport', schema)
