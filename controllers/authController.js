import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import User from '../models/User.js' // Keep capitalized for now
import { parseSAID } from '../utils/idParser.js'

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  })
}

// REGISTER

export const registerUser = async (req, res) => {
  try {
    const {
      identityType,
      idNumber,
      passportNumber,
      surname,
      initials,
      firstNames,
      phone,
      email,
      password,
    } = req.body

    if (
      !identityType ||
      !surname ||
      !initials ||
      !firstNames ||
      !phone ||
      !email ||
      !password
    ) {
      return res.status(400).json({ message: 'Missing required fields' })
    }

    let dateOfBirth
    let gender

    // ✅ ONLY parse if RSA ID
    if (identityType === 'RSA_ID') {
      if (!idNumber) {
        return res.status(400).json({ message: 'ID number required' })
      }

      const parsed = parseSAID(idNumber)
      dateOfBirth = parsed.dateOfBirth
      gender = parsed.gender
    }

    // ✅ Passport validation
    if (identityType === 'PASSPORT' && !passportNumber) {
      return res.status(400).json({ message: 'Passport number required' })
    }

    const userExists = await User.findOne({ email })
    if (userExists) {
      return res.status(400).json({ message: 'User already exists' })
    }

    const salt = await bcrypt.genSalt(10)
    const hashedPassword = await bcrypt.hash(password, salt)

    const user = await User.create({
      identityType,
      idNumber,
      passportNumber,
      surname,
      initials,
      firstNames,
      phone,
      email,
      password: hashedPassword,
      dateOfBirth,
      gender,
      role: 'user',
    })

    res.status(201).json({
      _id: user._id,
      email: user.email,
      token: generateToken(user._id),
    })
    console.log(req.body)
  } catch (error) {
    console.log(error)
    res.status(500).json({ message: error.message })
  }
}

// LOGIN
export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body

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
      surname: user.surname,
      firstNames: user.firstNames,
      email: user.email,
      role: user.role,
      token: generateToken(user._id),
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// GET MY PROFILE
export const getMe = async (req, res) => {
  res.json(req.user)
}

// UPDATE MY PROFILE
export const updateMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    const {
      surname,
      initials,
      firstNames,
      phone,
      email,
      password,
    } = req.body

    user.surname = surname || user.surname
    user.initials = initials || user.initials
    user.firstNames = firstNames || user.firstNames
    user.phone = phone || user.phone
    user.email = email || user.email

    if (password) {
      const salt = await bcrypt.genSalt(10)
      user.password = await bcrypt.hash(password, salt)
    }

    const updatedUser = await user.save()

    res.json({
      _id: updatedUser._id,
      surname: updatedUser.surname,
      firstNames: updatedUser.firstNames,
      email: updatedUser.email,
      phone: updatedUser.phone,
      role: updatedUser.role,
      partner: updatedUser.partner,
      token: generateToken(updatedUser._id),
    })
  } catch (error) {
    res.status(500).json({ message: error.message })
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
    const user = await User.findById(req.params.id)

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    const {
      surname,
      initials,
      firstNames,
      phone,
      email,
      role,
      partner,
    } = req.body

    user.surname = surname || user.surname
    user.initials = initials || user.initials
    user.firstNames = firstNames || user.firstNames
    user.phone = phone || user.phone
    user.email = email || user.email
    user.role = role || user.role
    user.partner = partner || user.partner

    const updatedUser = await user.save()

    res.json({
      _id: updatedUser._id,
      surname: updatedUser.surname,
      firstNames: updatedUser.firstNames,
      email: updatedUser.email,
      phone: updatedUser.phone,
      role: updatedUser.role,
      partner: updatedUser.partner,
    })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// ADMIN: DELETE USER
export const deleteUserById = async (req, res) => {
  try {
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