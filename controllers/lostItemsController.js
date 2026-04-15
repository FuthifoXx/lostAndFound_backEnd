import LostItem from '../models/LostItem.js'
import { findMatchingUser } from '../utils/matchUser.js'
import { notifyUser } from '../utils/notifyUser.js'
import sendEmail from '../utils/sendEmail.js'
import sendSMS from '../utils/sendSMS.js'
import sendWhatsApp from '../utils/sendWhatsApp.js'
import cloudinary from '../config/cloudinary.js'
import uploadToCloudinary from '../utils/uploadToCloudinary.js'
import notificationService from '../services/notificationService.js'

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
    const items = await LostItem.find({ user: req.user._id })
      .populate('user', 'name email')
      .populate('partner', 'name branch address')

    res.json(items)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// Create a lost item
export const addLostItem = async (req, res) => {
  const {
    name,
    description,
    location,
    dateLost,
    partner,
    identityType,
    idNumber,
    passportNumber,
    surname,
    initials,
    firstNames,
  } = req.body

  if (!name || !description || !location || !dateLost) {
    return res.status(400).json({ message: 'All fields are required' })
  }

  try {
    let imageUrl = null

    // 🖼️ Upload image if exists
    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer)
      imageUrl = result.secure_url
    }

    const newItem = await LostItem.create({
      user: req.user._id,
      name,
      description,
      location,
      partner: partner || req.user.partner,
      dateLost: new Date(dateLost),

      identityType,
      idNumber,
      passportNumber,
      surname,
      initials,
      firstNames,
      image: imageUrl,
    })

    console.log('NEW ITEM:', newItem)

    const matchedUser = await findMatchingUser(newItem)

    console.log('MATCHED USER:', matchedUser)

    if (matchedUser) {
      newItem.matchedUser = matchedUser._id
      newItem.status = 'matched'

      const updatedItem = await newItem.save()

      // ✅ SEND NOTIFICATION
      await notificationService.sendMatchNotification(matchedUser, updatedItem)

      return res.status(201).json(updatedItem)
    }

    // ✅ NO MATCH CASE
    return res.status(201).json(newItem)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: error.message })
  }
}

//Update a lost item
export const updateLostItem = async (req, res) => {
  try {
    const item = await LostItem.findById(req.params.id)
    // if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    //   return res.status(400).json({ message: 'Invalid item ID' })
    // }
    if (!item) {
      return res.status(404).json({ message: 'Item not found' })
    }

    //Ownership check
    if (
      item.user.toString() !== req.user._id.toString() &&
      req.user.role !== 'admin' &&
      req.user.role !== 'partner'
    ) {
      return res.status(401).json({ message: 'Not authorized' })
    }

    const { name, description, location, dateLost, status } = req.body

    item.name = name || item.name
    item.description = description || item.description
    item.location = location || item.location
    item.dateLost = dateLost || item.dateLost
    item.status = status || item.status

    const updatedItem = await item.save()

    res.json(updatedItem)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// Reject / Delete a lost item (Admin control) admin-aware + owner-aware
export const deleteLostItem = async (req, res) => {
  try {
    const item = await LostItem.findById(req.params.id)

    if (!item) {
      return res.status(404).json({ message: 'Item not found' })
    }

    //Ownership OR admin can delete
    if (
      item.user.toString() !== req.user._id.toString() &&
      req.user.role !== 'admin'
    ) {
      return res.status(401).json({ message: 'Not authorized' })
    }

    await item.deleteOne()

    res.json({ message: 'Lost item removed' })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

export const approveLostItem = async (req, res) => {
  try {
    const item = await LostItem.findById(req.params.id)

    if (!item) {
      return res.status(404).json({ message: 'Item not found' })
    }

    item.approved = true

    const updatedItem = await item.save()
    res.json(updatedItem)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

//Waiting for approval
export const getPendingItems = async (req, res) => {
  try {
    const items = await LostItem.find({ approved: false })
      .sort({ createdAt: -1 })
      .populate('user', 'name email')
      .populate('partner', 'name branch address')

    if (items.length === 0) {
      return res.json({ message: 'No pending items', items: [] })
    }

    res.json(items)
  } catch (error) {
    console.log(error)
    res.status(500).json({ message: error.message })
  }
}

//User Request Claim
export const requestClaim = async (req, res) => {
  try {
    const item = await LostItem.findById(req.params.id)

    if (!item) {
      return res.status(404).json({ message: 'Item not found' })
    }

    // Only matched user can claim
    if (
      !item.matchedUser ||
      item.matchedUser.toString() !== req.user._id.toString()
    ) {
      return res
        .status(403)
        .json({ message: 'Not authorized to claim this item' })
    }

    if (item.claimStatus === 'pending') {
      return res.status(400).json({ message: 'Claim already requested' })
    }

    item.claimRequestedBy = req.user._id
    item.claimStatus = 'pending'

    await item.save()

    await notificationService.sendClaimRequestNotification(item)

    res.json({ message: 'Claim request sent', item })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

//Partner Approves Claim
export const approveClaim = async (req, res) => {
  try {
    const item = await LostItem.findById(req.params.id)

    if (!item) {
      return res.status(404).json({ message: 'Item not found' })
    }

    // Only partner who owns item
    if (!item.partner || !req.user.partner) {
      return res.status(403).json({ message: 'Partner not assigned properly' })
    }

    if (item.partner.toString() !== req.user.partner.toString()) {
      return res.status(403).json({ message: 'Not your item' })
    }

    item.claimStatus = 'approved'
    item.status = 'claimed'
    item.claimedAt = new Date()

    await item.save()

    await notificationService.sendClaimRequestNotification(item)

    res.json({ message: 'Item claimed successfully', item })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

//Partner Rejects Claim
export const rejectClaim = async (req, res) => {
  try {
    const item = await LostItem.findById(req.params.id)

    if (
      !item.partner ||
      item.partner.toString() !== req.user.partner.toString()
    ) {
      return res.status(404).json({ message: 'Not your item' })
    }

    item.claimStatus = 'rejected'
    item.claimRequestedBy = null

    await item.save()

    res.json({ message: 'Claim rejected', item })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}
