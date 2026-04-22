import mongoose from 'mongoose'

const notificationSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    item: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LostItem',
    },

    type: {
      type: String,
      enum: ['MATCH_FOUND', 'CLAIM_REQUEST', 'CLAIM_APPROVED'],
      required: true,
    },

    message: {
      type: String,
      required: true,
    },

    channel: {
      type: String,
      enum: ['SMS', 'WHATSAPP', 'EMAIL'],
    },

    status: {
      type: String,
      enum: ['pending', 'sent', 'failed'],
      default: 'pending',
    },

    sentAt: Date,
  },
  { timestamps: true },
)

const Notification = mongoose.model('Notification', notificationSchema)
export default Notification
