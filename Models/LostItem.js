import mongoose from 'mongoose';

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
    partener: {
      type: String,
      enum: ['Shoprite', 'Pick n Pay', 'Pep', 'Checkers', 'Other'],
      default: 'Other',
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
      enum: ['lost', 'found', 'claimed'],
      default: 'lost',
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
export default LostItem;