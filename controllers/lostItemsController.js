import mongoose from 'mongoose'
import { fileTypeFromBuffer } from 'file-type'
import LostItem from '../models/LostItem.js'
import User from '../models/User.js'
import Notification from '../models/Notification.js'
import { findMatchingUser } from '../utils/matchUser.js'
import { notifyUser } from '../utils/notifyUser.js'
import sendEmail from '../utils/sendEmail.js'
import sendSMS from '../utils/sendSMS.js'
import sendWhatsApp from '../utils/sendWhatsApp.js'
import cloudinary from '../config/cloudinary.js'
import notificationService from '../services/notificationService.js'
import { response } from 'express'
import {
  createPrivateDocumentUrl,
  deletePrivateDocument,
  uploadPrivateDocument,
} from '../utils/s3Storage.js'

const PUBLIC_LOST_ITEM_FIELDS =
  'name description location image dateLost status partner createdAt'

const getCloudinaryPublicIdFromUrl = (imageUrl) => {
  if (!imageUrl) return null

  try {
    const url = new URL(imageUrl)

    if (url.hostname !== 'res.cloudinary.com') {
      return null
    }

    const uploadPath = url.pathname.split('/upload/')[1]

    if (!uploadPath) {
      return null
    }

    const publicIdWithExtension = uploadPath.replace(/^v\d+\//, '')

    return decodeURIComponent(publicIdWithExtension.replace(/\.[^/.]+$/, ''))
  } catch {
    return null
  }
}

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
            { location: { $regex: req.query.keyword, $options: 'i' } },
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
      status: 'approved',
      ...keyword,
      ...location,
      ...partner,
    }

    const totalItems = await LostItem.countDocuments(filter)

    const items = await LostItem.find(filter)
      .select(`${PUBLIC_LOST_ITEM_FIELDS} +imageKey`)
      .sort({ createdAt: -1 })
      .populate('partner', 'name branch')
      .skip(skip)
      .limit(limit)

    const publicItems = items.map((item) => {
      const { image, imageKey, ...publicItem } = item.toObject()

      return {
        ...publicItem,
        hasProtectedImage: Boolean(image || imageKey),
      }
    })

    res.json({
      items: publicItems,
      page,
      pages: Math.ceil(totalItems / limit),
      totalItems,
    })
  } catch (error) {
    console.log(error)
    res.status(500).json({ message: error.message })
  }
}

// Get only items matched to the signed-in user
export const getMyLostItems = async (req, res) => {
  try {
    const items = await LostItem.find({ matchedUser: req.user._id })
      .select('+imageKey')
      .populate('user', 'name email')
      .populate('partner', 'name branch address')

    const responseItems = await Promise.all(
      items.map(async (item) => {
        const { imageKey, imagePublicId, ...responseItem } = item.toObject()

        responseItem.image = imageKey
          ? await createPrivateDocumentUrl(imageKey)
          : item.image

        responseItem.hasProtectedImage = Boolean(item.image || imageKey)

        return responseItem
      }),
    )

    res.set('Cache-Control', 'private, no-store')
    return res.json(responseItems)
  } catch (error) {
    return res.status(500).json({ message: error.message })
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
      .select('+imageKey')
      .populate('partner', 'name branch')

    if (!item) {
      return res.status(404).json({
        message: 'Item not found',
      })
    }

    const isMatchedUser = Boolean(
      req.user &&
      item.matchedUser &&
      item.matchedUser.toString() === req.user._id.toString(),
    )

    const isAdmin = req.user?.role === 'admin'

    const isItemCreator = Boolean(
      req.user && item.user.toString() === req.user._id.toString(),
    )

    const isPubliclyAvailable =
      item.approved === true && item.status === 'approved'

    const canViewPrivateState = isMatchedUser || isAdmin || isItemCreator

    if (!isPubliclyAvailable && !canViewPrivateState) {
      return res.status(404).json({
        message: 'Item not found',
      })
    }

    let protectedImageUrl

    if (canViewPrivateState) {
      protectedImageUrl = item.imageKey
        ? await createPrivateDocumentUrl(item.imageKey)
        : item.image
    }

    const responseItem = {
      _id: item._id,
      name: item.name,
      description: item.description,
      location: item.location,
      partner: item.partner,
      image: protectedImageUrl,
      hasProtectedImage: Boolean(item.image || item.imageKey),
      dateLost: item.dateLost,
      status: item.status,
      createdAt: item.createdAt,
      isMatchedUser,
    }

    if (canViewPrivateState) {
      responseItem.claimStatus = item.claimStatus
    }
    res.set('Cache-Control', 'private, no-store')
    return res.json(responseItem)
  } catch (error) {
    console.error(error)

    return res.status(500).json({
      message: error.message,
    })
  }
}

// Create a lost item
export const addLostItem = async (req, res) => {
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

  let imageKey = null
  let itemSaved = false

  try {
    let detectedType

    if (req.file) {
      detectedType = await fileTypeFromBuffer(req.file.buffer)
      const allowedMimeTypes = new Set([
        'image/jpeg',
        'image/png',
        'image/webp',
      ])

      if (!detectedType || !allowedMimeTypes.has(detectedType.mime)) {
        return res.status(400).json({
          message:
            'Uploaded file content is not a valid JPEG, PNG, or WebP image',
        })
      }
    }
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

    // Upload verified image to private S3 storage
    if (req.file) {
      imageKey = await uploadPrivateDocument({
        buffer: req.file.buffer,
        contentType: detectedType.mime,
        extension: detectedType.ext,
      })
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
      imageKey,
    })

    itemSaved = true

    // Item remains pending until admin approval
    const responseItem = newItem.toObject()
    delete responseItem.imagePublicId
    delete responseItem.imageKey

    responseItem.hasProtectedImage = Boolean(imageKey)

    return res.status(201).json(responseItem)
  } catch (error) {
    if (imageKey && !itemSaved) {
      try {
        await deletePrivateDocument(imageKey)
      } catch (cleanupError) {
        console.error('S3 upload rollback failed', {
          message: cleanupError.message,
        })
      }
    }

    console.error(error)
    return res.status(500).json({ message: error.message })
  }
}

//Update a lost item
export const updateLostItem = async (req, res) => {
  let uploadedImageKey = null
  let itemSaved = false
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid item ID' })
    }
    const item = await LostItem.findById(req.params.id).select(
      '+imageKey +imagePublicId',
    )

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

    let detectedType

    if (req.file) {
      if (item.approved || item.status !== 'pending') {
        return res.status(400).json({
          message: 'Document images can only be changed before approval',
        })
      }

      detectedType = await fileTypeFromBuffer(req.file.buffer)

      const allowedMimeTypes = new Set([
        'image/jpeg',
        'image/png',
        'image/webp',
      ])

      if (!detectedType || !allowedMimeTypes.has(detectedType.mime)) {
        return res.status(400).json({
          message:
            'Uploaded file content is not a valid JPEG, PNG, or WebP image',
        })
      }
    }

    const { name, description, location, dateLost } = req.body

    item.name = name || item.name
    item.description = description || item.description
    item.location = location || item.location
    item.dateLost = dateLost || item.dateLost

    // Validate text changes before uploading a new file.
    await item.validate()

    const previousImageKey = item.imageKey
    const previousImagePublicId =
      item.imagePublicId || getCloudinaryPublicIdFromUrl(item.image)

    if (req.file) {
      // Save only if the stored item still matches what we loaded.
      item.$where = {
        approved: false,
        status: 'pending',
        updatedAt: item.updatedAt,
        partner: item.partner,
        imageKey: item.imageKey ?? null,
        image: item.image ?? null,
        imagePublicId: item.imagePublicId ?? null,
      }

      uploadedImageKey = await uploadPrivateDocument({
        buffer: req.file.buffer,
        contentType: detectedType.mime,
        extension: detectedType.ext,
      })

      item.imageKey = uploadedImageKey
      item.image = undefined
      item.imagePublicId = undefined
    }

    const updatedItem = await item.save()
    itemSaved = true

    // Remove the previous image only after the new reference is saved.
    let imageCleanupWarning

    if (uploadedImageKey) {
      try {
        if (previousImageKey) {
          await deletePrivateDocument(previousImageKey)
        }

        if (previousImagePublicId) {
          const result = await cloudinary.uploader.destroy(
            previousImagePublicId,
            {
              resource_type: 'image',
              invalidate: true,
            },
          )

          if (!['ok', 'not found'].includes(result.result)) {
            throw new Error('Unexpected Cloudinary cleanup result')
          }
        }
      } catch (cleanupError) {
        console.error('Previous image cleanup failed', {
          itemId: item._id.toString(),
          previousImageKey,
          previousImagePublicId,
          message: cleanupError.message,
        })

        imageCleanupWarning =
          'The new image was saved, but the previous image could not be removed. Administrator cleanup is required.'
      }
    }

    const { imageKey, imagePublicId, ...responseItem } = updatedItem.toObject()

    responseItem.image = imageKey
      ? await createPrivateDocumentUrl(imageKey)
      : updatedItem.image

    responseItem.hasProtectedImage = Boolean(updatedItem.image || imageKey)

    if (imageCleanupWarning) {
      responseItem.warning = imageCleanupWarning
    }

    res.set('Cache-Control', 'private, no-store')
    return res.json(responseItem)
  } catch (error) {
    if (uploadedImageKey && !itemSaved) {
      const saveDefinitelyRejected = [
        'DocumentNotFoundError',
        'VersionError',
        'ValidationError',
        'CastError',
      ].includes(error.name)

      if (saveDefinitelyRejected) {
        try {
          await deletePrivateDocument(uploadedImageKey)
        } catch (cleanupError) {
          console.error('Replacement image rollback failed', {
            itemId: req.params.id,
            imageKey: uploadedImageKey,
            message: cleanupError.message,
          })
        }
      } else {
        // The database write outcome may be uncertain.
        // Retain the image until its stored reference can be checked.
        console.error('Replacement image requires reconciliation', {
          itemId: req.params.id,
          imageKey: uploadedImageKey,
          message: error.message,
        })
      }
    }

    if (
      !itemSaved &&
      (error.name === 'DocumentNotFoundError' || error.name === 'VersionError')
    ) {
      return res.status(409).json({
        message:
          'This item changed or was deleted while you were updating it. Refresh the item before trying again.',
      })
    }

    console.error('Lost item update failed', {
      itemId: req.params.id,
      message: error.message,
    })

    return res.status(500).json({
      message: itemSaved
        ? 'Item was saved, but the response could not be completed. Refresh the item before retrying.'
        : 'Unable to update item',
    })
  }
}

// Reject / Delete a lost item (Admin control) admin-aware + owner-aware
export const deleteLostItem = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid item ID' })
    }

    const item = await LostItem.findById(req.params.id).select(
      '+imagePublicId +imageKey',
    )

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

    if (item.imageKey) {
      try {
        await deletePrivateDocument(item.imageKey)
      } catch (storageError) {
        console.error('S3 document cleanup failed', {
          itemId: item._id.toString(),
          message: storageError.message,
        })

        return res.status(502).json({
          message: 'Image cleanup failed; item was not deleted',
        })
      }
    }

    const imagePublicId =
      item.imagePublicId || getCloudinaryPublicIdFromUrl(item.image)

    if (imagePublicId) {
      try {
        const result = await cloudinary.uploader.destroy(imagePublicId, {
          resource_type: 'image',
          invalidate: true,
        })

        if (!['ok', 'not found'].includes(result.result)) {
          return res.status(502).json({
            message: 'Image cleanup failed; item was not deleted',
          })
        }
      } catch (cloudinaryError) {
        console.error('Cloudinary image cleanup failed', {
          itemId: item._id.toString(),
          message: cloudinaryError.message,
        })

        return res.status(502).json({
          message: 'Image cleanup failed; item was not deleted',
        })
      }
    }

    await Notification.deleteMany({ item: item._id })
    await item.deleteOne()

    return res.json({ message: 'Lost item removed' })
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

    const item = await LostItem.findById(req.params.id).select('+imageKey')

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

    const { imageKey, imagePublicId, ...responseItem } = updatedItem.toObject()

    responseItem.image = imageKey
      ? await createPrivateDocumentUrl(imageKey)
      : updatedItem.image

    responseItem.hasProtectedImage = Boolean(updatedItem.image || imageKey)

    res.set('Cache-Control', 'private, no-store')
    return res.json(responseItem)
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
    const items = await LostItem.find({
      approved: false,
      status: 'pending',
    })
      .select('+imageKey')
      .sort({ createdAt: -1 })
      .populate('user', 'name email')
      .populate('partner', 'name branch address')

    res.set('Cache-Control', 'private, no-store')

    if (items.length === 0) {
      return res.json({ message: 'No pending items', items: [] })
    }

    const responseItems = await Promise.all(
      items.map(async (item) => {
        const { imageKey, imagePublicId, ...responseItem } = item.toObject()

        responseItem.image = imageKey
          ? await createPrivateDocumentUrl(imageKey)
          : item.image

        responseItem.hasProtectedImage = Boolean(item.image || imageKey)

        return responseItem
      }),
    )

    return res.json(responseItems)
  } catch (error) {
    console.error(error)
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
      .select('+imageKey')
      .populate('matchedUser', 'email firstNames surname')
      .populate('partner', 'name branch')

    const responseItems = await Promise.all(
      items.map(async (item) => {
        const { imageKey, imagePublicId, ...responseItem } = item.toObject()

        responseItem.image = imageKey
          ? await createPrivateDocumentUrl(imageKey)
          : item.image

        responseItem.hasProtectedImage = Boolean(item.image || imageKey)

        return responseItem
      }),
    )

    res.set('Cache-Control', 'private, no-store')
    return res.json(responseItems)
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

    res.set('Cache-Control', 'private, no-store')

    return res.json({
      message: 'Claim request sent',
      item: {
        _id: item._id,
        status: item.status,
        claimStatus: item.claimStatus,
        claimRequestedAt: item.claimRequestedAt,
        isMatchedUser: true,
      },
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

    const item = await LostItem.findById(req.params.id).select('+imageKey')

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

    const { imageKey, imagePublicId, ...responseItem } = item.toObject()

    responseItem.image = imageKey
      ? await createPrivateDocumentUrl(imageKey)
      : item.image

    responseItem.hasProtectedImage = Boolean(item.image || imageKey)

    res.set('Cache-Control', 'private, no-store')

    return res.json({
      message: 'Item claimed successfully',
      item: responseItem,
    })
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

    const item = await LostItem.findById(req.params.id).select('+imageKey')

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

    const { imageKey, imagePublicId, ...responseItem } = item.toObject()

    responseItem.image = imageKey
      ? await createPrivateDocumentUrl(imageKey)
      : item.image

    responseItem.hasProtectedImage = Boolean(item.image || imageKey)

    res.set('Cache-Control', 'private, no-store')

    return res.json({
      message: 'Claim rejected',
      item: responseItem,
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

    const item = await LostItem.findById(req.params.id).select('+imageKey')

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

    const { imageKey, imagePublicId, ...responseItem } = item.toObject()

    responseItem.image = imageKey
      ? await createPrivateDocumentUrl(imageKey)
      : item.image

    responseItem.hasProtectedImage = Boolean(item.image || imageKey)

    res.set('Cache-Control', 'private, no-store')

    return res.json({
      message: 'Item marked as recovered',
      item: responseItem,
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

    const item = await LostItem.findById(req.params.id).select('+imageKey')

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

    const { imageKey, imagePublicId, ...responseItem } = item.toObject()

    responseItem.image = imageKey
      ? await createPrivateDocumentUrl(imageKey)
      : item.image

    responseItem.hasProtectedImage = Boolean(item.image || imageKey)

    res.set('Cache-Control', 'private, no-store')

    return res.json({
      message: 'Case closed',
      item: responseItem,
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
    // Partners see statistics belonging to their partner.
    // Users see only items matched to their identity.
    if (req.user.role === 'partner') {
      if (!req.user.partner) {
        return res.status(403).json({
          message: 'Partner not assigned properly',
        })
      }

      filter.partner = req.user.partner
    } else if (req.user.role === 'user') {
      filter.matchedUser = req.user._id
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
    if (!req.user.partner) {
      return res.status(403).json({
        message: 'No partner assigned to this account',
      })
    }

    const items = await LostItem.find({
      partner: req.user.partner,
    })
      .select('+imageKey')
      .sort({ createdAt: -1 })
      .populate('matchedUser', 'email firstNames surname')
      .populate('partner', 'name branch address')

    const responseItems = await Promise.all(
      items.map(async (item) => {
        const { imageKey, imagePublicId, ...responseItem } = item.toObject()

        responseItem.image = imageKey
          ? await createPrivateDocumentUrl(imageKey)
          : item.image

        responseItem.hasProtectedImage = Boolean(item.image || imageKey)

        return responseItem
      }),
    )

    res.set('Cache-Control', 'private, no-store')
    return res.json(responseItems)
  } catch (error) {
    return res.status(500).json({ message: error.message })
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
    const closedCases = await LostItem.countDocuments({
      status: 'closed',
    })

    const recentPendingItems = await LostItem.find({
      approved: false,
      status: 'pending',
    })
      .select('+imageKey')
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('partner', 'name branch')

    const recentPendingClaims = await LostItem.find({ claimStatus: 'pending' })
      .select('+imageKey')
      .sort({ updatedAt: -1 })
      .limit(5)
      .populate('matchedUser', 'email firstNames surname')
      .populate('partner', 'name branch')

    const serializeItem = async (item) => {
      const { imageKey, imagePublicId, ...responseItem } = item.toObject()

      responseItem.image = imageKey
        ? await createPrivateDocumentUrl(imageKey)
        : item.image

      responseItem.hasProtectedImage = Boolean(item.image || imageKey)

      return responseItem
    }

    const [responsePendingItems, responsePendingClaims] = await Promise.all([
      Promise.all(recentPendingItems.map(serializeItem)),
      Promise.all(recentPendingClaims.map(serializeItem)),
    ])

    res.set('Cache-Control', 'private, no-store')

    res.json({
      stats: {
        totalItems,
        pendingItems,
        matchedItems,
        pendingClaims,
        recoveredItems,
        closedCases,
      },
      recentPendingItems: responsePendingItems,
      recentPendingClaims: responsePendingClaims,
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
      .select('+imageKey')
      .sort({ recoveredAt: -1 })
      .populate('matchedUser', 'email')
      .populate('partner', 'name branch')

    const responseItems = await Promise.all(
      items.map(async (item) => {
        const { imageKey, imagePublicId, ...responseItem } = item.toObject()

        responseItem.image = imageKey
          ? await createPrivateDocumentUrl(imageKey)
          : item.image

        responseItem.hasProtectedImage = Boolean(item.image || imageKey)

        return responseItem
      }),
    )

    res.set('Cache-Control', 'private, no-store')
    return res.json(responseItems)
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
      .select('+imageKey')
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

    const { imageKey, imagePublicId, ...responseItem } = item.toObject()

    responseItem.image = imageKey
      ? await createPrivateDocumentUrl(imageKey)
      : item.image

    responseItem.hasProtectedImage = Boolean(item.image || imageKey)

    res.set('Cache-Control', 'private, no-store')

    return res.json({
      item: responseItem,
      timeline,
    })
  } catch (error) {
    console.error(error)

    return res.status(500).json({
      message: error.message,
    })
  }
}
