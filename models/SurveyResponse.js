import mongoose from 'mongoose'

const surveyResponseSchema = new mongoose.Schema({
  experience: String, // Retained for earlier survey responses.
  surveyVersion: { type: Number, default: 2 },
  seenAppBefore: String,
  lostItem: String,
  recovered: String,
  recoveryMethod: String,
  queueRating: Number,
  helpDeskRating: Number,
  customerServiceRating: Number,
  replacementFeeFair: String,
  subscribe: String,
  willingToPay: Number,
  lostBefore: { type: String, required: true },
  usefulness: { type: String, required: true },
  recommend: { type: String, required: true },
  interest: { type: String, required: true },
  ease: String,
  feedback: { type: String, maxlength: 1000 },
  contact: { type: String, maxlength: 120 },
  contactConsent: { type: Boolean, default: false },
  consentVersion: { type: String, default: 'community-pilot-v1' },
}, { timestamps: true })

export default mongoose.model('SurveyResponse', surveyResponseSchema)
