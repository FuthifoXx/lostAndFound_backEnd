import mongoose from 'mongoose'

const partnerSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    branch: {
      type: String,
      required: true,
      trim: true,
    },

    address: {
      type: String,
      required: true,
      trim: true,
    },

    contact: {
      type: String,
      trim: true,
    },

    isVerified: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
)

partnerSchema.index(
  { name: 1, branch: 1 },
  {
    unique: true,
    name: 'unique_partner_branch',
    collation: {
      locale: 'en',
      strength: 2,
    },
  },
)

const Partner = mongoose.model('Partner', partnerSchema)

export default Partner
