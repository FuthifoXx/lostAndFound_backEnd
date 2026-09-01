import mongoose from 'mongoose'

const caseNoteSchema = mongoose.Schema(
  {
    item: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LostItem',
      required: true,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    note: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true },
)

const CaseNote = mongoose.model('CaseNote', caseNoteSchema)

export default CaseNote
