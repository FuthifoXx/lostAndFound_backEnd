import mongoose from 'mongoose'

const userSchema = mongoose.Schema(
  {
    identityType: {
      type: String,
      enum: ['RSA_ID', 'PASSPORT', 'OTHER'],
      required: true,
    },

    idNumber: {
      type: String,
      required: function () {
        return this.identityType === 'RSA_ID'
      },
      unique: true,
      sparse: true, // allows nulls for non-RSA users
    },

    passportNumber: {
      type: String,
      required: function () {
        return this.identityType === 'PASSPORT'
      },
      sparse: true,
    },

    surname: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },

    initials: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },

    firstNames: {
      type: [String],
      validate: [(arr) => arr.length <= 3, 'Max 3 names allowed'],
    },

    dateOfBirth: {
      type: Date, // optional now
    },

    gender: {
      type: String,
      enum: ['male', 'female'],
    },

    phone: {
      type: String,
      required: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },

    password: {
      type: String,
      required: true,
    },

    role: {
      type: String,
      enum: ['user', 'admin', 'partner'],
      default: 'user',
    },
    partner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Partner',

    }
  },
  { timestamps: true },
)

const User = mongoose.model('User', userSchema)
export default User
