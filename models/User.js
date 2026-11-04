import mongoose from 'mongoose'

const userSchema = mongoose.Schema(
  {
    displayName: { type:String, trim:true, maxlength:80 },
    emailVerifiedAt: Date,
    matchingActive: Boolean,
    candidateMatching: Boolean,
    matchingConsentAt: Date,
    matchingConsentVersion: String,
    identityType: {
      type: String,
      enum: ['RSA_ID', 'PASSPORT', 'OTHER'],
      trim: true,
      uppercase: true,
    },

    idNumber: {
      type: String,
      required: function () {
        return this.identityType === 'RSA_ID' && this.matchingActive !== false
      },
      trim: true,
      unique: true,
      sparse: true, // allows nulls for non-RSA users
    },

    passportNumber: {
      type: String,
      required: function () {
        return this.identityType === 'PASSPORT' && this.matchingActive !== false
      },
      trim: true,
      uppercase: true,
    },

    surname: {
      type: String,
      uppercase: true,
      trim: true,
    },

    initials: {
      type: String,
      uppercase: true,
      trim: true,
    },

    firstNames: {
      type: [String],
      validate: [(arr) => arr.length <= 3, 'Max 3 names allowed'],
    },
    documentNumber: {
      type: String,
      trim: true,
      uppercase: true,
    },

    dateOfBirth: {
      type: Date,
    },

    gender: {
      type: String,
      enum: ['male', 'female'],
    },

    phone: {
      type: String,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },

    password: {
      type: String,
      required: true,
    },

    authVersion: { type: Number, default: 0 },

    role: {
      type: String,
      enum: ['user', 'admin', 'partner'],
      default: 'user',
    },
    partner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Partner',
    },
  },
  { timestamps: true },
)

userSchema.index(
  { passportNumber: 1 },
  {
    unique: true,
    name: 'unique_passport_number',
    partialFilterExpression: {
      identityType: 'PASSPORT',
      passportNumber: { $type: 'string', $gt: '' },
    },
  },
)

userSchema.index(
  { documentNumber: 1 },
  {
    unique: true,
    name: 'unique_other_document_number',
    partialFilterExpression: {
      identityType: 'OTHER',
      documentNumber: { $type: 'string', $gt: '' },
    },
  },
)

const User = mongoose.model('User', userSchema)
export default User
