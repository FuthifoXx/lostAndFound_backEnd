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
    })

    res.status(201).json({
      _id: user._id,
      email: user.email,
      token: generateToken(user._id),
    })
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
      firstName: user.firstNames,
      email: user.email,
      role: user.role,
      token: generateToken(user._id),
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}
