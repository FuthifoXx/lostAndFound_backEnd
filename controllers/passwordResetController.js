import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import User from '../models/User.js'
import PasswordReset from '../models/PasswordReset.js'
import RecoveryLimit from '../models/RecoveryLimit.js'
import sendEmail from '../utils/sendEmail.js'

const genericMessage = 'If an account uses that email address, a password reset link will be sent. Check your inbox and spam folder.'
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex')
const validPassword = (password) => typeof password === 'string' && password.length >= 8 && Buffer.byteLength(password, 'utf8') <= 72

export const recoveryLimit = async (req, res, next) => {
  res.set('Cache-Control', 'no-store')
  try {
    const bucket = Math.floor(Date.now() / (15 * 60 * 1000))
    const key = hash(`${req.ip}:${bucket}`)
    const limit = await RecoveryLimit.findOneAndUpdate({ _id: key }, {
      $inc: { count: 1 },
      $setOnInsert: { expiresAt: new Date((bucket + 2) * 15 * 60 * 1000) },
    }, { upsert: true, new: true })
    if (limit.count > 20) {
      res.set('Retry-After', '900')
      return res.status(429).json({ message: 'Too many attempts. Please wait 15 minutes before trying again.' })
    }
    next()
  } catch {
    res.status(503).json({ message: 'Account recovery is temporarily unavailable. Please try again later.' })
  }
}

export const forgotPassword = async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'Enter a valid email address.' })
  }
  try {
    // Never build recovery links from caller-controlled Host or Origin headers.
    const frontend = new URL(process.env.FRONTEND_URL)
    if (frontend.protocol !== 'https:' && !(frontend.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(frontend.hostname))) {
      throw new Error('Invalid recovery origin')
    }
    const user = await User.findOne({ email })
    if (user) {
      const now = new Date()
      const token = crypto.randomBytes(32).toString('hex')
      const tokenHash = hash(token)
      let reset
      try {
        // The unique user index makes simultaneous requests respect the cooldown.
        reset = await PasswordReset.findOneAndUpdate({
          userId: user._id,
          requestedAt: { $lt: new Date(now.getTime() - 5 * 60 * 1000) },
        }, { $set: { tokenHash, requestedAt: now, expiresAt: new Date(now.getTime() + 30 * 60 * 1000) } }, { upsert: true, new: true })
      } catch (error) {
        if (error.code !== 11000) throw error
      }
      if (reset) {
        const link = new URL('/reset-password', frontend.origin)
        // A fragment keeps the token out of server request URLs and referrers.
        link.hash = token
        try {
          await sendEmail(user.email, 'Reset your Back 2 Owner password',
            `A password reset was requested for your Back 2 Owner account.\n\nOpen this link to choose a new password:\n${link}\n\nThis link expires in 30 minutes and can be used once. If you did not request this, ignore this email. Your password has not changed. Never share this link.`)
        } catch {
          // No token, email address, or provider secrets in application logs.
          console.error('Password reset email could not be confirmed; check email provider logs.')
        }
      }
    }
    return res.json({ message: genericMessage })
  } catch {
    return res.status(503).json({ message: 'Account recovery is temporarily unavailable. Please try again later.' })
  }
}

export const resetPassword = async (req, res) => {
  const { token, password } = req.body || {}
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
    return res.status(400).json({ message: 'This reset link is invalid or has expired. Please request a new link.' })
  }
  if (!validPassword(password)) {
    return res.status(400).json({ message: 'Use at least 8 characters and no more than 72 bytes for your password.' })
  }
  try {
    const tokenHash = hash(token)
    const existing = await PasswordReset.findOne({ tokenHash, expiresAt: { $gt: new Date() } })
    if (!existing) return res.status(400).json({ message: 'This reset link is invalid or has expired. Please request a new link.' })
    const passwordHash = await bcrypt.hash(password, 10)
    // Consume atomically: only one request can use a token, even concurrently.
    const reset = await PasswordReset.findOneAndDelete({ tokenHash, expiresAt: { $gt: new Date() } })
    if (!reset) return res.status(400).json({ message: 'This reset link is invalid or has expired. Please request a new link.' })
    const user = await User.findOneAndUpdate({ _id: reset.userId }, {
      $set: { password: passwordHash }, $inc: { authVersion: 1 },
    })
    if (!user) return res.status(400).json({ message: 'This reset link is invalid or has expired. Please request a new link.' })
    return res.json({ message: 'Your password has been reset. Please sign in with your new password.' })
  } catch {
    return res.status(503).json({ message: 'Your password could not be reset. Please request a new link and try again.' })
  }
}
