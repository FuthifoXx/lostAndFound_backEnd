import CollectionReceipt from '../models/CollectionReceipt.js'
import LostItem from '../models/LostItem.js'
import generateReceiptPDF from '../utils/generateReceiptPDF.js'

export const createReceipt = async (req, res) => {
  try {
    const { itemId } = req.params
    const { collectedBy, signature, notes } = req.body

    const item = await LostItem.findById(itemId)
      .populate('matchedUser')
      .populate('partner')

    if (!item) {
      return res.status(404).json({
        message: 'Item not found',
      })
    }

    if (!['recovered', 'closed'].includes(item.status)) {
      return res.status(400).json({
        message: 'Receipt can only be generated after recovery',
      })
    }

    if (!item.matchedUser) {
      return res.status(400).json({
        message: 'No owner has been matched to this item.',
      })
    }

    //Prevent duplicate receipts
    const existingReceipt = await CollectionReceipt.findOne({
      item: item._id,
    })

    if (existingReceipt) {
      return res.status(200).json(existingReceipt)
    }

    //Generate receipt number
    const nextNumber = (await CollectionReceipt.countDocuments()) + 1

    const receiptNumber = `LAF-${new Date().getFullYear()}-${String(nextNumber).padStart(6, '0')}`

    const receipt = await CollectionReceipt.create({
      receiptNumber,
      item: item._id,
      owner: item.matchedUser._id,
      partner: item.partner._id,
      collectedBy,
      signature,
      notes,
      idNumber: item.matchedUser.idNumber,
      passportNumber: item.matchedUser.passportNumber,
      documentNumber: item.matchedUser.documentNumber,
    })

    res.status(201).json(receipt)
  } catch (error) {
    res.status(500).json({
      message: error.message,
    })
  }
}

export const getReceiptByItem = async (req, res) => {
  try {
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

    res.json(receipt)
  } catch (error) {
    res.status(500).json({
      message: error.message,
    })
  }
}

export const downloadReceiptPDF = async (req, res) => {
  try {
    const { itemId } = req.params

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

    res.status(500).json({
      message: error.message,
    })
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