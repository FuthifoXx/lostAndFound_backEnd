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
    //TODO make filtering easier in the frontend
    // category: {
    //      type: String,
    //      enum: ['document','phone','wallet','keys','other'],
    //      default: 'other'
    // }
    // image: {type: String}
  },
  { timestamps: true },
)

const LostItem = mongoose.model('LostItem', lostItemSchema)
export default LostItem
