import mongoose from 'mongoose'

const collectionReceiptSchema = mongoose.Schema(
  {
    item: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LostItem',
      required: true,
    },

    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    partner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Partner',
      required: true,
    },

    collectedBy: {
      type: String,
      required: true,
    },

    idNumber: String,
    passportNumber: String,
    documentNumber: String,

    signature: {
      type: String,
    },

    notes: String,

    collectedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
)

const CollectionReceipt = mongoose.model(
  'CollectionReceipt',
  collectionReceiptSchema,
)

export default CollectionReceipt
