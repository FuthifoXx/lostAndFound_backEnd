import mongoose from 'mongoose'

const lostItemSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    location: {
      type: String,
      required: true,
    },
    partner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Partner',
    },
    image: {
      type: String,
    },
    dateLost: {
      type: Date,
      required: true,
    },
    approved: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ['pending', 'matched', 'found', 'claimed'],
      default: 'pending',
    },
    identityType: {
      type: String,
      enum: ['RSA_ID', 'PASSPORT', 'OTHER'],
    },
    idNumber: String,
    passportNumber: String,

    surname: String,
    initials: String,
    firstNames: [String],
    matchedUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    claimRequestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    claimStatus: {
      type: String,
      enum: ['none', 'pending', 'approved', 'rejected'],
      default: 'none',
    },
    claimedAt: Date,
  },
  { timestamps: true },
)

const LostItem = mongoose.model('LostItem', lostItemSchema)
export default LostItem
