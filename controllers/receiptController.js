import CollectionReceipt from '../models/CollectionReceipt.js'
import LostItem from '../models/LostItem.js'

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

    if (item.status !== 'recovered') {
      return res.status(400).json({
        message: 'Receipt can only be generated for recovered items',
      })
    }

    const receipt = await CollectionReceipt.create({
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
      .populate('owner')
      .populate('partner')
      .populate('item')

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