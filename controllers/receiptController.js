import mongoose from 'mongoose'
import CollectionReceipt from '../models/CollectionReceipt.js'
import LostItem from '../models/LostItem.js'
import generateReceiptPDF from '../utils/generateReceiptPDF.js'

const authorizeReceiptAccess = (partner, user, res) => {
  if (user.role === 'admin') {
    return true
  }

  if (!partner || !user.partner) {
    res.status(403).json({
      message: 'Partner not assigned properly',
    })
    return false
  }

  const partnerId = partner._id ? partner._id.toString() : partner.toString()

  if (partnerId !== user.partner.toString()) {
    res.status(403).json({
      message: 'Not your item',
    })
    return false
  }

  return true
}

export const createReceipt = async (req, res) => {
  try {
    const { itemId } = req.params
    const { collectedBy, signature, notes } = req.body

    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json({
        message: 'Invalid item ID',
      })
    }

    const item = await LostItem.findById(itemId)
      .populate('matchedUser')
      .populate('partner')

    if (!item) {
      return res.status(404).json({
        message: 'Item not found',
      })
    }

    if (!authorizeReceiptAccess(item.partner, req.user, res)) {
      return
    }

    if (!['recovered', 'closed'].includes(item.status)) {
      return res.status(400).json({
        message: 'Receipt can only be generated after recovery',
      })
    }

    if (!item.matchedUser) {
      return res.status(400).json({
        message: 'No owner has been matched to this item',
      })
    }

    const existingReceipt = await CollectionReceipt.findOne({
      item: item._id,
    })

    if (existingReceipt) {
      return res.status(200).json(existingReceipt)
    }

    const normalizedCollectedBy = collectedBy?.trim()

    if (!normalizedCollectedBy) {
      return res.status(400).json({
        message: 'Collected-by name is required',
      })
    }

    const nextNumber = (await CollectionReceipt.countDocuments()) + 1

    const receiptNumber =
      `LAF-${new Date().getFullYear()}-` + String(nextNumber).padStart(6, '0')

    const receipt = await CollectionReceipt.create({
      receiptNumber,
      item: item._id,
      owner: item.matchedUser._id,
      partner: item.partner._id,
      collectedBy: normalizedCollectedBy,
      signature: signature?.trim() || undefined,
      notes: notes?.trim() || undefined,
      idNumber: item.matchedUser.idNumber,
      passportNumber: item.matchedUser.passportNumber,
      documentNumber: item.matchedUser.documentNumber,
    })

    return res.status(201).json(receipt)
  } catch (error) {
    console.error(error)

    return res.status(500).json({
      message: error.message,
    })
  }
}

export const getReceiptByItem = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.itemId)) {
      return res.status(400).json({
        message: 'Invalid item ID',
      })
    }

    const receipt = await CollectionReceipt.findOne({
      item: req.params.itemId,
    })
      .populate('owner', 'surname firstNames email')
      .populate('partner', 'name branch')
      .populate(
        'item',
        'name description location dateLost image identityType initials surname firstNames',
      )

    if (!receipt) {
      return res.status(404).json({
        message: 'Receipt not found',
      })
    }

    if (!authorizeReceiptAccess(receipt.partner, req.user, res)) {
      return
    }

    return res.json(receipt)
  } catch (error) {
    console.error(error)

    return res.status(500).json({
      message: error.message,
    })
  }
}

export const downloadReceiptPDF = async (req, res) => {
  try {
    const { itemId } = req.params

    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json({
        message: 'Invalid item ID',
      })
    }

    const receipt = await CollectionReceipt.findOne({
      item: itemId,
    })
      .populate('owner', 'surname firstNames email')
      .populate('partner', 'name branch')
      .populate('item')

    if (!receipt) {
      return res.status(404).json({
        message: 'Receipt not found',
      })
    }

    if (!authorizeReceiptAccess(receipt.partner, req.user, res)) {
      return
    }

    const { doc } = await generateReceiptPDF(receipt)

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${receipt.receiptNumber}.pdf"`,
    )

    doc.pipe(res)
    doc.end()
  } catch (error) {
    console.error(error)

    if (!res.headersSent) {
      return res.status(500).json({
        message: error.message,
      })
    }

    res.end()
  }
}

export const verifyReceipt = async (req, res) => {
  try {
    const { receiptNumber } = req.params

    const receipt = await CollectionReceipt.findOne({
      receiptNumber,
    })
      .populate('owner', 'surname firstNames')
      .populate('partner', 'name branch')
      .populate('item', 'name description location')

    if (!receipt) {
      return res.status(404).json({
        verified: false,
        message: 'Receipt not found',
      })
    }

    res.json({
      verified: true,
      receipt: {
        receiptNumber: receipt.receiptNumber,
        owner: receipt.owner,
        partner: receipt.partner,
        item: receipt.item,
        collectedAt: receipt.collectedAt,
        collectedBy: receipt.collectedBy,
      },
    })
  } catch (error) {
    res.status(500).json({
      verified: false,
      message: error.message,
    })
  }
}
