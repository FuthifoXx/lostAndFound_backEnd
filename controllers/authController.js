import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import User from '../models/User.js' // Keep capitalized for now
import { cleanText, safeProfile } from '../utils/recoveryProfile.js'
import { sendVerification } from './recoveryProfileController.js'

const generateToken = (id, authVersion = 0) => {
  return jwt.sign({ id, authVersion }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  })
}

// REGISTER

export const registerUser = async (req, res) => {
  const displayName = cleanText(req.body?.displayName,80)
  const email = cleanText(req.body?.email,254).toLowerCase()
  const password = req.body?.password
  if (!displayName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message:'Enter a display name and a valid email address.' })
  if (typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password,'utf8') > 72) return res.status(400).json({ message:'Use at least 8 characters and no more than 72 bytes for your password.' })
  try {
    if (await User.exists({email})) return res.status(409).json({ message:'Unable to create an account with these details. Try signing in or recovering your password.' })
    const user = await User.create({ displayName,email,password:await bcrypt.hash(password,10),role:'user',matchingActive:false,candidateMatching:false })
    try { await sendVerification(user) } catch { console.error('New account confirmation email could not be confirmed.') }
    return res.status(201).json({ _id:user._id, displayName:user.displayName, email:user.email,role:user.role, message:'Account created. Sign in to confirm your email and choose your recovery options.' })
  } catch(error) {
    if(error.code === 11000) return res.status(409).json({ message:'Unable to create an account with these details. Try signing in or recovering your password.' })
    return res.status(500).json({ message:'Account could not be created. Please try again.' })
  }
}

// LOGIN
export const loginUser = async (req, res) => {
  try {
    const { password } = req.body
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : ''

    if (!email || !password) {
      return res.status(400).json({ message: 'All fields are required' })
    }

    const user = await User.findOne({ email })
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' })
    }

    const isMatch = await bcrypt.compare(password, user.password)
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' })
    }

    res.json({
      _id: user._id,
      displayName: user.displayName,
      surname: user.surname,
      firstNames: user.firstNames,
      email: user.email,
      role: user.role,
      token: generateToken(user._id, user.authVersion),
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// GET MY PROFILE
export const getMe = async (req, res) => {
  res.set('Cache-Control','private, no-store')
  res.json(safeProfile(req.user))
}

// UPDATE MY PROFILE
export const updateMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)

    if (!user) {
      return res.status(404).json({
        message: 'User not found',
      })
    }

    const { surname, initials, firstNames, phone, email, password } = req.body

    if (Object.prototype.hasOwnProperty.call(req.body, 'email')) {
      if (typeof email !== 'string' || !email.trim()) {
        return res.status(400).json({
          message: 'Email is required',
        })
      }

      const normalizedEmail = email.trim().toLowerCase()

      const emailExists = await User.exists({
        _id: { $ne: user._id },
        email: normalizedEmail,
      })

      if (emailExists) {
        return res.status(409).json({
          message: 'Email already registered',
        })
      }

      if (user.email !== normalizedEmail) {
        user.emailVerifiedAt = undefined
        user.matchingActive = false
        user.candidateMatching = false
      }
      user.email = normalizedEmail
    }

    if (req.body.displayName !== undefined && req.body.displayName !== '') {
      const displayName = cleanText(req.body.displayName,80)
      if (!displayName) return res.status(400).json({ message:'Enter a display name of up to 80 characters.' })
      user.displayName = displayName
    }
    user.surname = surname || user.surname
    user.initials = initials || user.initials
    user.firstNames = firstNames || user.firstNames
    user.phone = phone || user.phone

    if (password) {
      if (typeof password !== 'string' || password.length < 6) {
        return res.status(400).json({
          message: 'Password must be at least 6 characters long',
        })
      }
      const salt = await bcrypt.genSalt(10)
      user.password = await bcrypt.hash(password, salt)
    }

    const updatedUser = await user.save()

    return res.json({
      displayName: updatedUser.displayName,
      _id: updatedUser._id,
      surname: updatedUser.surname,
      firstNames: updatedUser.firstNames,
      email: updatedUser.email,
      phone: updatedUser.phone,
      role: updatedUser.role,
      partner: updatedUser.partner,
      token: generateToken(updatedUser._id, updatedUser.authVersion),
    })
  } catch (error) {
    // Protect against simultaneous requests passing the earlier lookup.
    if (error?.code === 11000 && error?.keyPattern?.email) {
      return res.status(409).json({
        message: 'Email already registered',
      })
    }

    if (error?.name === 'ValidationError') {
      return res.status(400).json({
        message: 'Invalid profile data',
      })
    }

    console.error(error)

    return res.status(500).json({
      message: 'Server error',
    })
  }
}

// DELETE MY ACCOUNT
export const deleteMe = async (req, res) => {
  try {
    await User.findByIdAndDelete(req.user._id)

    res.json({ message: 'Account deleted successfully' })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// ADMIN: GET ALL USERS
export const getAllUsers = async (req, res) => {
  try {
    const users = await User.find()
      .select('-password')
      .populate('partner', 'name branch address')
      .sort({ createdAt: -1 })

    res.json(users)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// ADMIN: GET SINGLE USER
export const getUserById = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        message: 'Invalid user ID',
      })
    }

    const user = await User.findById(req.params.id)
      .select('-password')
      .populate('partner', 'name branch address')

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    res.json(user)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// ADMIN: UPDATE USER
export const updateUserById = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        message: 'Invalid user ID',
      })
    }

    const user = await User.findById(req.params.id)

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    const { surname, initials, firstNames, phone, email, role, partner } =
      req.body

    if (Object.prototype.hasOwnProperty.call(req.body, 'email')) {
      if (typeof email !== 'string' || !email.trim()) {
        return res.status(400).json({
          message: 'Email is required',
        })
      }

      const normalizedEmail = email.trim().toLowerCase()

      const emailExists = await User.exists({
        _id: { $ne: user._id },
        email: normalizedEmail,
      })

      if (emailExists) {
        return res.status(409).json({
          message: 'Email already registered',
        })
      }
      if (user.email !== normalizedEmail) {
        user.emailVerifiedAt = undefined
        user.matchingActive = false
        user.candidateMatching = false
      }
      user.email = normalizedEmail
    }

    user.surname = surname || user.surname
    user.initials = initials || user.initials
    user.firstNames = firstNames || user.firstNames
    user.phone = phone || user.phone
    user.email = email || user.email
    user.role = role || user.role
    user.partner = partner || user.partner

    const updatedUser = await user.save()

    return res.json({
      _id: updatedUser._id,
      surname: updatedUser.surname,
      firstNames: updatedUser.firstNames,
      email: updatedUser.email,
      phone: updatedUser.phone,
      role: updatedUser.role,
      partner: updatedUser.partner,
    })
  } catch (error) {
    if (error?.code === 11000 && error?.keyPattern?.email) {
      return res.status(409).json({ message: 'Email already registered' })
    }
    if (error?.name === 'ValidationError') {
      return res.status(400).json({
        message: 'Invalid user data',
      })
    }
    console.error(error)

    return res.status(500).json({
      message: 'Server error',
    })
  }
}

// ADMIN: DELETE USER
export const deleteUserById = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        message: 'Invalid user ID',
      })
    }

    const user = await User.findById(req.params.id)

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    await user.deleteOne()

    res.json({ message: 'User deleted successfully' })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}
