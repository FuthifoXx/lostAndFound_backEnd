import mongoose from 'mongoose'

const lostItemSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    matchedUser: {
      type: mongoose.Schema.Types.ObjectId,
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
      enum: [
        'pending',
        'matched',
        'claim_requested',
        'claim_approved',
        'recovered',
        'closed',
      ],
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
    recoveredAt: Date,
    closedAt: Date,
  },
  { timestamps: true },
)

const LostItem = mongoose.model('LostItem', lostItemSchema)
export default LostItem
