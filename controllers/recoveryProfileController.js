import crypto from 'node:crypto'
import User from '../models/User.js'
import LostItem from '../models/LostItem.js'
import LossReport from '../models/LossReport.js'
import EmailVerification from '../models/EmailVerification.js'
import sendEmail from '../utils/sendEmail.js'
import notificationService from '../services/notificationService.js'
import {
  safeProfile,
  parseRecoveryProfile,
  possibleFilter,
  cleanText,
} from '../utils/recoveryProfile.js'
const digest = (value) =>
  crypto.createHash('sha256').update(value).digest('hex')

export const sendVerification = async (user) => {
  if (user.emailVerifiedAt) return
  const origin = new URL(process.env.FRONTEND_URL)
  if (
    origin.protocol !== 'https:' &&
    !(
      origin.protocol === 'http:' &&
      ['localhost', '127.0.0.1'].includes(origin.hostname)
    )
  )
    throw new Error('Invalid frontend origin')
  const token = crypto.randomBytes(32).toString('hex')
  const now = new Date()
  try {
    await EmailVerification.findOneAndUpdate(
      { userId: user._id, requestedAt: { $lt: new Date(now - 5 * 60000) } },
      {
        $set: {
          email: user.email,
          tokenHash: digest(token),
          requestedAt: now,
          expiresAt: new Date(+now + 30 * 60000),
        },
      },
      { upsert: true, new: true },
    )
  } catch (error) {
    if (error.code === 11000) return
    throw error
  }
  const link = new URL('/verify-email', origin.origin)
  link.hash = token
  await sendEmail(
    user.email,
    'Confirm your Back 2 Owner email',
    `Welcome to Back 2 Owner. Confirm your email to enable private recovery matching:\n\n${link}\n\nThis link expires in 30 minutes and can be used once. It confirms access to your inbox, not ownership of any document. If you did not request this, ignore this email.`,
  )
}
export const requestVerification = async (req, res) => {
  res.set('Cache-Control', 'private, no-store')
  if (!req.user.emailVerifiedAt) {
    try {
      await sendVerification(req.user)
    } catch {
      console.error('Email confirmation delivery could not be confirmed.')
    }
  }
  res.json({
    message:
      'If your email needs confirmation, a link has been requested. Check your inbox and spam. Wait 5 minutes before requesting another.',
  })
}
export const verifyEmail = async (req, res) => {
  res.set('Cache-Control', 'no-store')
  const token = req.body?.token
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token))
    return res
      .status(400)
      .json({
        message:
          'This confirmation link is invalid or expired. Request a new link from Recovery setup.',
      })
  try {
    const record = await EmailVerification.findOneAndDelete({
      tokenHash: digest(token),
      expiresAt: { $gt: new Date() },
    })
    const user =
      record &&
      (await User.findOneAndUpdate(
        { _id: record.userId, email: record.email },
        { $set: { emailVerifiedAt: new Date() } },
      ))
    if (!user)
      return res
        .status(400)
        .json({
          message:
            'This confirmation link is invalid or expired. Request a new link from Recovery setup.',
        })
    return res.json({
      message:
        'Email confirmed. Sign in and open Recovery setup to choose your matching options.',
    })
  } catch {
    return res
      .status(503)
      .json({
        message:
          'Email confirmation is temporarily unavailable. Please try again later.',
      })
  }
}
const relink = async (user, identityFilter) => {
  // Atomic assignment preserves an existing match/claim when approvals overlap.
  const items = await LostItem.find({
    ...identityFilter,
    approved: true,
    status: 'approved',
    matchedUser: null,
  }).select('_id')
  let count = 0
  for (const item of items) {
    const matched = await LostItem.findOneAndUpdate(
      { _id: item._id, approved: true, status: 'approved', matchedUser: null },
      {
        $set: {
          matchedUser: user._id,
          status: 'matched',
          matchedAt: new Date(),
        },
      },
      { new: true },
    )
    if (matched) {
      count++
      await notificationService.sendMatchNotification(user, matched)
    }
  }
  return count
}
export const saveRecoveryProfile = async (req, res) => {
  res.set('Cache-Control', 'private, no-store')
  if (!req.user.emailVerifiedAt)
    return res
      .status(403)
      .json({
        message: 'Confirm your email before enabling recovery matching.',
      })
  let parsed
  try {
    parsed = parseRecoveryProfile(req.body)
  } catch (error) {
    return res.status(400).json({ message: error.message })
  }
  try {
    const { data, identityFilter, mode } = parsed
    if (
      identityFilter &&
      (await User.exists({ ...identityFilter, _id: { $ne: req.user._id } }))
    )
      return res
        .status(409)
        .json({
          message:
            'These document details cannot be added. Contact Back 2 Owner for help.',
        })
    // Keep established matching details immutable through this setup screen.
    if (
      req.user.identityType &&
      req.user.matchingActive !== false &&
      (req.user.idNumber || req.user.passportNumber || req.user.documentNumber)
    ) {
      const field = {
        RSA_ID: 'idNumber',
        PASSPORT: 'passportNumber',
        OTHER: 'documentNumber',
      }[req.user.identityType]
      if (
        mode !== 'exact' ||
        data.identityType !== req.user.identityType ||
        data[field] !== req.user[field]
      )
        return res
          .status(409)
          .json({
            message:
              'An exact matching document is already set up. Contact Back 2 Owner to change it.',
          })
    }
    const fields = {
      ...data,
      matchingActive: mode === 'exact',
      candidateMatching: mode === 'possible',
      matchingConsentAt: new Date(),
      matchingConsentVersion: 'progressive-v1',
    }
    const unset = Object.fromEntries(
      ['idNumber', 'passportNumber', 'documentNumber', 'dateOfBirth']
        .filter((key) => !(key in data))
        .map((key) => [key, 1]),
    )
    const user = await User.findOneAndUpdate(
      {
        _id: req.user._id,
        email: req.user.email,
        emailVerifiedAt: req.user.emailVerifiedAt,
      },
      { $set: fields, $unset: unset },
      { new: true, runValidators: true },
    )
    if (!user)
      return res
        .status(409)
        .json({ message: 'Your profile changed. Reload and try again.' })
    let matchedItems = 0,
      matchingPending = false
    if (identityFilter) {
      try {
        matchedItems = await relink(user, identityFilter)
      } catch {
        matchingPending = true
      }
    }
    return res.json({
      ...safeProfile(user),
      matchedItems,
      message: matchingPending
        ? 'Matching details saved. Matching could not finish; save again to retry.'
        : 'Recovery matching details saved. Ownership still needs partner verification.',
    })
  } catch (error) {
    if (error.code === 11000)
      return res
        .status(409)
        .json({
          message:
            'These document details cannot be added. Contact Back 2 Owner for help.',
        })
    return res
      .status(500)
      .json({ message: 'Recovery setup could not be saved. Please try again.' })
  }
}
export const getPossibleMatches = async (req, res) => {
  res.set('Cache-Control', 'private, no-store')
  try {
    const filter = possibleFilter(req.user)
    if (!filter) return res.json({ items: [] })
    const items = await LostItem.find(filter)
      .select('_id identityType')
      .limit(10)
      .lean()
    // Never return source names, DOB, images, numbers, location or raw descriptions.
    return res.json({
      items: items.map((item) => ({
        reference: item._id,
        documentType:
          { RSA_ID: 'RSA ID', PASSPORT: 'Passport', OTHER: 'Other document' }[
            item.identityType
          ] || 'Document',
        status: 'possible',
      })),
    })
  } catch {
    return res
      .status(500)
      .json({ message: 'Possible matches could not be checked.' })
  }
}
export const getLossReports = async (req, res) => {
  res.set('Cache-Control', 'private, no-store')
  try {
    return res.json(
      await LossReport.find({ user: req.user._id })
        .sort({ createdAt: -1 })
        .limit(10),
    )
  } catch {
    return res
      .status(500)
      .json({ message: 'Your reports could not be loaded.' })
  }
}
export const createLossReport = async (req, res) => {
  const itemType = cleanText(req.body?.itemType, 80),
    area = cleanText(req.body?.area, 120),
    details = cleanText(req.body?.details, 500)
  const dateLost = req.body?.dateLost
  if (
    !itemType ||
    (req.body.area && !area) ||
    (req.body.details && !details) ||
    (dateLost &&
      (typeof dateLost !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(dateLost) ||
        Number.isNaN(Date.parse(dateLost)) ||
        new Date(dateLost).toISOString().slice(0, 10) !== dateLost ||
        new Date(dateLost) > new Date()))
  )
    return res
      .status(400)
      .json({
        message:
          'Enter an item type, a valid loss date and shorter report details.',
      })
  res.set('Cache-Control', 'private, no-store')
  try {
    if ((await LossReport.countDocuments({ user: req.user._id })) >= 10)
      return res
        .status(400)
        .json({
          message:
            'You can keep up to 10 private loss reports during the pilot.',
        })
    return res
      .status(201)
      .json(
        await LossReport.create({
          user: req.user._id,
          itemType,
          area,
          details,
          ...(dateLost ? { dateLost } : {}),
        }),
      )
  } catch {
    return res.status(500).json({ message: 'Your report could not be saved.' })
  }
}
