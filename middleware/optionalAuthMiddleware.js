import jwt from 'jsonwebtoken'
import User from '../models/User.js'

const optionalAuth = async (req, res, next) => {
  const authorization = req.headers.authorization

  if (!authorization) {
    return next()
  }

  if (!authorization.startsWith('Bearer ')) {
    return res.status(401).json({
      message: 'Not authorized, token failed',
    })
  }

  const token = authorization.slice(7).trim()

  if (!token) {
    return next()
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    const user = await User.findById(decoded.id).select('-password')

    if (!user) {
      return res.status(401).json({
        message: 'User not found',
      })
    }

    req.user = user
    return next()
  } catch {
    return res.status(401).json({
      message: 'Not authorized, token failed',
    })
  }
}

export default optionalAuth
