import mongoose from 'mongoose'
import LostItem from '../models/LostItem.js'
import User from '../models/User.js'
import Notification from '../models/Notification.js'
import { findMatchingUser } from '../utils/matchUser.js'
import { notifyUser } from '../utils/notifyUser.js'
import sendEmail from '../utils/sendEmail.js'
import sendSMS from '../utils/sendSMS.js'
import sendWhatsApp from '../utils/sendWhatsApp.js'
import cloudinary from '../config/cloudinary.js'
import uploadToCloudinary from '../utils/uploadToCloudinary.js'
import notificationService from '../services/notificationService.js'
import { response } from 'express'

// Get all lost items
export const getAllLostItems = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1
    const limit = Number(req.query.limit) || 5

    const skip = (page - 1) * limit

    //Search keyword
    const keyword = req.query.keyword
      ? {
          $or: [
            { name: { $regex: req.query.keyword, $options: 'i' } },
            { description: { $regex: req.query.keyword, $options: 'i' } },
          ],
        }
      : {}

    //Location filter
    const location = req.query.location
      ? { location: { $regex: req.query.location, $options: 'i' } }
      : {}

    //Partner
    const partner = req.query.partner ? { partner: req.query.partner } : {}

    //Combine filters
    const filter = {
      approved: true,
      ...keyword,
      ...location,
      ...partner,
    }

    const totalItems = await LostItem.countDocuments(filter)

    const items = await LostItem.find(filter)
      .sort({ createdAt: -1 })
      .populate('user', 'name email')
      .populate('partner', 'name branch address')
      .skip(skip)
      .limit(limit)

    res.json({
      items,
      page,
      pages: Math.ceil(totalItems / limit),
      totalItems,
    })
  } catch (error) {
    console.log(error)
    res.status(500).json({ message: error.message })
  }
}

//Get only items created by the us
export const getMyLostItems = async (req, res) => {
  try {
    const items = await LostItem.find({ matchedUser: req.user._id })
      .populate('user', 'name email')
      .populate('partner', 'name branch address')

    res.json(items)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

//Get a single lost item
export const getLostItemById = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        message: 'Invalid item ID',
      })
    }

    const item = await LostItem.findById(req.params.id)

    if (!item) {
      return res.status(404).json({
        message: 'Item not found',
      })
    }

    return res.json(item)
  } catch (error) {
    console.error(error)

    return res.status(500).json({
      message: error.message,
    })
  }
}

// Create a lost item
export const addLostItem = async (req, res) => {
  console.log(req.file)

  const {
    name,
    description,
    location,
    dateLost,
    identityType,
    idNumber,
    passportNumber,
    documentNumber,
    surname,
    initials,
    firstNames,
    dateOfBirth,
  } = req.body

  if (!name || !description || !location || !dateLost) {
    return res.status(400).json({ message: 'All fields are required' })
  }

  try {
    const activeStatuses = ['pending', 'approved', 'matched', 'claimed']

    let identifierFilter = null

    if (identityType === 'RSA_ID') {
      if (!idNumber) {
        return res.status(400).json({ message: 'ID number required' })
      }
      identifierFilter = {
        identityType: 'RSA_ID',
        idNumber,
      }
    }

    if (identityType === 'PASSPORT') {
      if (!passportNumber) {
        return res.status(400).json({ message: 'Passport number required' })
      }

      identifierFilter = {
        identityType: 'PASSPORT',
        passportNumber,
      }
    }

    if (identityType === 'OTHER') {
      if (!documentNumber) {
        return res.status(400).json({ message: 'Document number required' })
      }

      identifierFilter = {
        identityType: 'OTHER',
        documentNumber,
      }
    }

    if (identifierFilter) {
      const existingItem = await LostItem.findOne({
        ...identifierFilter,
        status: { $in: activeStatuses },
      }).select('_id status')

      if (existingItem) {
        return res.status(409).json({
          message: 'An active case already exists for this document',
          existingItemId: existingItem._id,
          status: existingItem.status,
        })
      }
    }

    let imageUrl = null

    // Upload image if exists
    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer)
      imageUrl = result.secure_url
    }

    const formattedFirstNames = Array.isArray(firstNames)
      ? firstNames
      : firstNames
          ?.split(' ')
          .map((name) => name.trim())
          .filter(Boolean)

    const newItem = await LostItem.create({
      user: req.user._id,
      name,
      description,
      location,
      partner: req.user.partner,
      dateLost: new Date(dateLost),

      identityType,
      idNumber,
      passportNumber,
      documentNumber,
      surname,
      initials,
      firstNames: formattedFirstNames,
      dateOfBirth,
      image: imageUrl,
    })

    console.log('NEW ITEM:', newItem)

    // Item remains pending until admin approval
    return res.status(201).json(newItem)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ message: error.message })
  }
}

//Update a lost item
export const updateLostItem = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid item ID' })
    }
    const item = await LostItem.findById(req.params.id)
    if (!item) {
      return res.status(404).json({ message: 'Item not found' })
    }

    // Admin may update any item.
    // Partners may update only items belonging to their partner.
    if (req.user.role !== 'admin') {
      if (!item.partner || !req.user.partner) {
        return res.status(403).json({
          message: 'Partner not assigned properly',
        })
      }

      if (item.partner.toString() !== req.user.partner.toString()) {
        return res.status(403).json({
          message: 'Not your item',
        })
      }
    }

    //Status check
    if (Object.prototype.hasOwnProperty.call(req.body, 'status')) {
      return res.status(400).json({
        message: 'Status must be changed through lifecycle endpoints',
      })
    }

    const { name, description, location, dateLost } = req.body

    item.name = name || item.name
    item.description = description || item.description
    item.location = location || item.location
    item.dateLost = dateLost || item.dateLost

    const updatedItem = await item.save()

    res.json(updatedItem)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// Reject / Delete a lost item (Admin control) admin-aware + owner-aware
export const deleteLostItem = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid item ID' })
    }

    const item = await LostItem.findById(req.params.id)

    if (!item) {
      return res.status(404).json({ message: 'Item not found' })
    }

    //Ownership OR admin can delete
    if (
      item.user.toString() !== req.user._id.toString() &&
      req.user.role !== 'admin'
    ) {
      return res.status(403).json({ message: 'Not authorized' })
    }

    await Notification.deleteMany({ item: item._id })
    await item.deleteOne()

    res.json({ message: 'Lost item removed' })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

export const approveLostItem = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        message: 'Invalid item ID',
      })
    }

    const item = await LostItem.findById(req.params.id)

    if (!item) {
      return res.status(404).json({
        message: 'Item not found',
      })
    }

    if (item.approved || item.status !== 'pending') {
      return res.status(400).json({
        message: 'Only pending items can be approved',
      })
    }

    item.approved = true
    item.approvedAt = new Date()
    item.status = 'approved'

    const matchedUser = await findMatchingUser(item)

    if (matchedUser) {
      item.matchedUser = matchedUser._id
      item.matchedAt = new Date()
      item.status = 'matched'
    }

    const updatedItem = await item.save()

    if (matchedUser) {
      await notificationService.sendMatchNotification(matchedUser, updatedItem)
    }

    return res.json(updatedItem)
  } catch (error) {
    console.error(error)

    return res.status(500).json({
      message: error.message,
    })
  }
}

//Waiting for approval
export const getPendingItems = async (req, res) => {
  try {
    const items = await LostItem.find({ approved: false, status: 'pending' })
      .sort({ createdAt: -1 })
      .populate('user', 'name email')
      .populate('partner', 'name branch address')

    if (items.length === 0) {
      return res.json({ message: 'No pending items', items: [] })
    }

    return res.json(items)
  } catch (error) {
    console.log(error)
    return res.status(500).json({ message: error.message })
  }
}

export const getPendingClaims = async (req, res) => {
  try {
    const filter = {
      claimStatus: 'pending',
    }

    // Partners may only view claims belonging to their own branch/partner
    if (req.user.role === 'partner') {
      if (!req.user.partner) {
        return res.status(403).json({
          message: 'Partner not assigned properly',
        })
      }

      filter.partner = req.user.partner
    }

    const items = await LostItem.find(filter)
      .populate('matchedUser', 'email firstNames surname')
      .populate('partner', 'name branch')

    return res.json(items)
  } catch (error) {
    console.error(error)

    return res.status(500).json({
      message: error.message,
    })
  }
}

//User Request Claim
export const requestClaim = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        message: 'Invalid item ID',
      })
    }

    const item = await LostItem.findById(req.params.id)

    if (!item) {
      return res.status(404).json({
        message: 'Item not found',
      })
    }

    // Only the matched user may request the claim.
    if (
      !item.matchedUser ||
      item.matchedUser.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        message: 'Not authorized to claim this item',
      })
    }

    // The item must still be available at the matched stage.
    if (!item.approved || item.status !== 'matched') {
      return res.status(400).json({
        message: 'Item is not available for claim',
      })
    }

    if (item.claimStatus === 'pending') {
      return res.status(400).json({
        message: 'Claim already requested',
      })
    }

    // Only a new or previously rejected claim can be requested.
    if (!['none', 'rejected'].includes(item.claimStatus)) {
      return res.status(400).json({
        message: 'Item is not available for claim',
      })
    }

    item.claimRequestedBy = req.user._id
    item.claimStatus = 'pending'
    item.claimRequestedAt = new Date()

    await item.populate('user', 'phone email role partner')
    await item.populate('partner')
    await item.populate(
      'matchedUser',
      'identityType surname initials firstNames documentNumber phone email role',
    )

    await item.save()

    await notificationService.sendClaimRequestNotification(item)

    return res.json({
      message: 'Claim request sent',
      item,
    })
  } catch (error) {
    console.error(error)

    return res.status(500).json({
      message: error.message,
    })
  }
}

//Partner Approves Claim
export const approveClaim = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        message: 'Invalid item ID',
      })
    }

    const item = await LostItem.findById(req.params.id)

    if (!item) {
      return res.status(404).json({ message: 'Item not found' })
    }

    //Admin may review any claim
    //Partners may only review claims belonging to their partner.
    if (req.user.role !== 'admin') {
      if (!item.partner || !req.user.partner) {
        return res.status(403).json({
          message: 'Partner not assigned properly',
        })
      }

      if (item.partner.toString() !== req.user.partner.toString()) {
        return res.status(403).json({
          message: 'Not your item',
        })
      }
    }

    if (
      item.claimStatus !== 'pending' ||
      item.status !== 'matched' ||
      !item.claimRequestedBy
    ) {
      return res.status(400).json({
        message: 'Only pending claims can be approved',
      })
    }

    item.claimStatus = 'approved'
    item.status = 'claimed'
    item.claimedAt = new Date()

    await item.populate('partner', 'name branch address contact isVerified')
    await item.populate(
      'matchedUser',
      'identityType surname initials firstNames documentNumber phone email role',
    )

    await item.save()

    await notificationService.sendClaimApprovedNotification(item)

    res.json({ message: 'Item claimed successfully', item })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// Partner/Admin Rejects Claim
export const rejectClaim = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        message: 'Invalid item ID',
      })
    }

    const item = await LostItem.findById(req.params.id)

    if (!item) {
      return res.status(404).json({
        message: 'Item not found',
      })
    }

    // Admin may reject any pending claim.
    // Partners may only reject claims belonging to their partner.
    if (req.user.role !== 'admin') {
      if (!item.partner || !req.user.partner) {
        return res.status(403).json({
          message: 'Partner not assigned properly',
        })
      }

      if (item.partner.toString() !== req.user.partner.toString()) {
        return res.status(403).json({
          message: 'Not your item',
        })
      }
    }

    if (
      item.claimStatus !== 'pending' ||
      item.status !== 'matched' ||
      !item.claimRequestedBy
    ) {
      return res.status(400).json({
        message: 'Only pending claims can be rejected',
      })
    }

    item.claimStatus = 'rejected'
    item.claimRequestedBy = null

    await item.populate(
      'matchedUser',
      'identityType surname initials firstNames documentNumber phone email role',
    )

    await item.save()

    await notificationService.sendClaimRejectedNotification(item)

    return res.json({
      message: 'Claim rejected',
      item,
    })
  } catch (error) {
    console.error(error)

    return res.status(500).json({
      message: error.message,
    })
  }
}

// Mark item as recovered
export const markAsRecovered = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        message: 'Invalid item ID',
      })
    }

    const item = await LostItem.findById(req.params.id)

    if (!item) {
      return res.status(404).json({
        message: 'Item not found',
      })
    }

    // Admin may process any recovery.
    // Partners may only process items belonging to their partner.
    if (req.user.role !== 'admin') {
      if (!item.partner || !req.user.partner) {
        return res.status(403).json({
          message: 'Partner not assigned properly',
        })
      }

      if (item.partner.toString() !== req.user.partner.toString()) {
        return res.status(403).json({
          message: 'Not your item',
        })
      }
    }

    if (
      item.status !== 'claimed' ||
      item.claimStatus !== 'approved' ||
      !item.claimRequestedBy
    ) {
      return res.status(400).json({
        message: 'Only claimed items can be marked as recovered',
      })
    }

    item.status = 'recovered'
    item.recoveredAt = new Date()

    await item.save()

    return res.json({
      message: 'Item marked as recovered',
      item,
    })
  } catch (error) {
    console.error(error)

    return res.status(500).json({
      message: error.message,
    })
  }
}

export const closeCase = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        message: 'Invalid item ID',
      })
    }

    const item = await LostItem.findById(req.params.id)

    if (!item) {
      return res.status(404).json({
        message: 'Item not found',
      })
    }

    // Admin may close any eligible case.
    // Partners may close only cases belonging to their partner.
    if (req.user.role !== 'admin') {
      if (!item.partner || !req.user.partner) {
        return res.status(403).json({
          message: 'Partner not assigned properly',
        })
      }

      if (item.partner.toString() !== req.user.partner.toString()) {
        return res.status(403).json({
          message: 'Not your item',
        })
      }
    }

    // Closure is allowed only once, after recovery.
    if (
      item.status !== 'recovered' ||
      item.claimStatus !== 'approved' ||
      !item.recoveredAt
    ) {
      return res.status(400).json({
        message: 'Only recovered items can be closed',
      })
    }

    item.status = 'closed'
    item.closedAt = new Date()

    await item.save()

    return res.json({
      message: 'Case closed',
      item,
    })
  } catch (error) {
    console.error(error)

    return res.status(500).json({
      message: error.message,
    })
  }
}

export const getDashboardStats = async (req, res) => {
  try {
    const filter = {}

    // Admin sees global statistics.
    // Partners see only statistics belonging to their partner.
    if (req.user.role !== 'admin') {
      if (!req.user.partner) {
        return res.status(403).json({
          message: 'Partner not assigned properly',
        })
      }

      filter.partner = req.user.partner
    }

    const [
      totalItems,
      matchedItems,
      pendingClaims,
      recoveredItems,
      closedCases,
    ] = await Promise.all([
      LostItem.countDocuments(filter),
      LostItem.countDocuments({ ...filter, status: 'matched' }),
      LostItem.countDocuments({ ...filter, claimStatus: 'pending' }),
      LostItem.countDocuments({ ...filter, status: 'recovered' }),
      LostItem.countDocuments({ ...filter, status: 'closed' }),
    ])

    return res.json({
      totalItems,
      matchedItems,
      pendingClaims,
      recoveredItems,
      closedCases,
    })
  } catch (error) {
    console.error(error)

    return res.status(500).json({
      message: error.message,
    })
  }
}

export const getPartnerItems = async (req, res) => {
  try {
    const items = await LostItem.find({
      partner: req.user.partner,
    })
      .sort({ createdAt: -1 })
      .populate('matchedUser', 'email firstNames surname')
      .populate('partner', 'name branch address')

    res.json(items)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

//Get admin dashboard data
export const getAdminDashboardData = async (req, res) => {
  try {
    const totalItems = await LostItem.countDocuments()
    const pendingItems = await LostItem.countDocuments({
      approved: false,
      status: 'pending',
    })
    const matchedItems = await LostItem.countDocuments({ status: 'matched' })
    const pendingClaims = await LostItem.countDocuments({
      claimStatus: 'pending',
    })
    const recoveredItems = await LostItem.countDocuments({
      status: 'recovered',
    })

    const recentPendingItems = await LostItem.find({
      approved: false,
      status: 'pending',
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('partner', 'name branch')

    const recentPendingClaims = await LostItem.find({ claimStatus: 'pending' })
      .sort({ updatedAt: -1 })
      .limit(5)
      .populate('matchedUser', 'email firstNames surname')
      .populate('partner', 'name branch')

    res.json({
      stats: {
        totalItems,
        pendingItems,
        matchedItems,
        pendingClaims,
        recoveredItems,
      },
      recentPendingItems,
      recentPendingClaims,
    })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

//Get recovery history
export const getRecoveryHistory = async (req, res) => {
  try {
    const filter = {
      status: { $in: ['recovered', 'closed'] },
    }

    // Partners may see only their own branch/organization records.
    // Admin may see the complete recovery history.
    if (req.user.role !== 'admin') {
      if (!req.user.partner) {
        return res.status(403).json({
          message: 'Partner not assigned properly',
        })
      }

      filter.partner = req.user.partner
    }

    const items = await LostItem.find(filter)
      .sort({ recoveredAt: -1 })
      .populate('matchedUser', 'email')
      .populate('partner', 'name branch')

    return res.json(items)
  } catch (error) {
    console.error(error)

    return res.status(500).json({
      message: error.message,
    })
  }
}

//Get Recovery Analytics
export const getRecoveryAnalytics = async (req, res) => {
  try {
    const filter = {}

    if (req.user.role !== 'admin') {
      if (!req.user.partner) {
        return res.status(403).json({
          message: 'Partner not assigned properly',
        })
      }

      filter.partner = req.user.partner
    }

    const [
      totalItems,
      recoveredItems,
      closedCases,
      matchedItems,
      claimedItems,
    ] = await Promise.all([
      LostItem.countDocuments(filter),
      LostItem.countDocuments({ ...filter, status: 'recovered' }),
      LostItem.countDocuments({ ...filter, status: 'closed' }),
      LostItem.countDocuments({ ...filter, status: 'matched' }),
      LostItem.countDocuments({ ...filter, status: 'claimed' }),
    ])

    const recoveryRate =
      totalItems > 0 ? ((recoveredItems + closedCases) / totalItems) * 100 : 0

    return res.json({
      totalItems,
      recoveredItems,
      closedCases,
      matchedItems,
      claimedItems,
      recoveryRate: recoveryRate.toFixed(1),
    })
  } catch (error) {
    console.error(error)

    return res.status(500).json({
      message: error.message,
    })
  }
}

//Get Branche Performance
export const getBranchPerformance = async (req, res) => {
  try {
    const performance = await LostItem.aggregate([
      {
        $match: {
          partner: { $ne: null },
        },
      },
      {
        $group: {
          _id: '$partner',
          totalItems: { $sum: 1 },
          recoveredItems: {
            $sum: {
              $cond: [{ $eq: ['$status', 'recovered'] }, 1, 0],
            },
          },
          closedCases: {
            $sum: {
              $cond: [{ $eq: ['$status', 'closed'] }, 1, 0],
            },
          },
          matchedItems: {
            $sum: {
              $cond: [{ $eq: ['$status', 'matched'] }, 1, 0],
            },
          },
        },
      },
      {
        $lookup: {
          from: 'partners',
          localField: '_id',
          foreignField: '_id',
          as: 'partner',
        },
      },
      {
        $unwind: '$partner',
      },
      {
        $project: {
          partnerId: '$_id',
          partnerName: '$partner.name',
          branch: '$partner.branch',
          address: '$partner.address',
          totalItems: 1,
          recoveredItems: 1,
          closedCases: 1,
          matchedItems: 1,
          recoveryRate: {
            $cond: [
              { $gt: ['$totalItems', 0] },
              {
                $multiply: [
                  {
                    $divide: [
                      { $add: ['$recoveredItems', '$closedCases'] },
                      '$totalItems',
                    ],
                  },
                  100,
                ],
              },
              0,
            ],
          },
        },
      },
      {
        $sort: {
          recoveredItems: -1,
          closedCases: -1,
        },
      },
    ])

    res.json(performance)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

//Get Item Timeline
export const getItemTimeline = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        message: 'Invalid item ID',
      })
    }

    const item = await LostItem.findById(req.params.id)
      .populate('matchedUser', 'email firstNames surname')
      .populate('partner', 'name branch address')

    if (!item) {
      return res.status(404).json({
        message: 'Item not found',
      })
    }

    // Admin may inspect every case.
    // Partners may inspect only their own cases.
    if (req.user.role !== 'admin') {
      if (!item.partner || !req.user.partner) {
        return res.status(403).json({
          message: 'Partner not assigned properly',
        })
      }

      const itemPartnerId = item.partner._id
        ? item.partner._id.toString()
        : item.partner.toString()

      if (itemPartnerId !== req.user.partner.toString()) {
        return res.status(403).json({
          message: 'Not your item',
        })
      }
    }

    const timeline = [
      {
        label: 'Uploaded',
        completed: true,
        date: item.createdAt,
      },
      {
        label: 'Approved',
        completed: Boolean(item.approvedAt),
        date: item.approvedAt || null,
      },
      {
        label: 'Matched',
        completed: Boolean(item.matchedAt),
        date: item.matchedAt || null,
      },
      {
        label: 'Claim Requested',
        completed: Boolean(item.claimRequestedAt),
        date: item.claimRequestedAt || null,
      },
      {
        label: 'Claim Approved',
        completed: item.claimStatus === 'approved',
        date: item.claimedAt || null,
      },
      {
        label: 'Recovered',
        completed: ['recovered', 'closed'].includes(item.status),
        date: item.recoveredAt || null,
      },
      {
        label: 'Closed',
        completed: item.status === 'closed',
        date: item.closedAt || null,
      },
    ]

    return res.json({
      item,
      timeline,
    })
  } catch (error) {
    console.error(error)

    return res.status(500).json({
      message: error.message,
    })
  }
}
