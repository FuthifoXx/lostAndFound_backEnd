import mongoose from 'mongoose'

const notificationSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    type: {
      type: String,
      enum: ['MATCH_FOUND', 'ITEM_APPROVED'],
    },
    message: String,
    channel: {
      type: String,
      enum: ['SMS', 'WHATSAPP'],
    },
    status: {
      type: String,
      enum: ['sent', 'failed'],
    },
  },
  { timestamps: true },
)

const Notification = mongoose.model('Notification', notificationSchema)

export default Notification
