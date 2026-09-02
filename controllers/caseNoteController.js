import mongoose from 'mongoose'
import CaseNote from '../models/CaseNote.js'
import LostItem from '../models/LostItem.js'

const authorizeCaseAccess = (item, user, res) => {
  if (user.role === 'admin') {
    return true
  }

  if (!item.partner || !user.partner) {
    res.status(403).json({
      message: 'Partner not assigned properly',
    })
    return false
  }
  if (item.partner.toString() !== user.partner.toString()) {
    res.status(403).json({
      message: 'Not your item',
    })
    return false
  }
  return true
}

export const addCaseNote = async (req, res) => {
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

    if (!authorizeCaseAccess(item, req.user,res)) {
      return 
    }

    const note = req.body.note?.trim()

    if (!note) {
      return res.status(400).json({
        message: 'Note is required',
      })
    }

    const caseNote = await CaseNote.create({
      item: item._id,
      user: req.user._id,
      note,
    })

    return res.status(201).json(caseNote)
  } catch (error) {
    console.error(error);
    
    return res.status(500).json({
      message: error.message,
    })
  }
}

export const getCaseNotes = async (req, res) => {
  try {
    if(!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        message: 'Invalid item ID'
      })
    }

    const item = await LostItem.findById(req.params.id)

    if(!item) {
      return res.status(404).json({
        message: 'Item not found',
      })
    }

    if (!authorizeCaseAccess(item, req.user,res)) {
      return
    }

    const notes = await CaseNote.find({
      item: req.params.id,
    })
      .populate('user', 'email firstNames surname role')
      .sort({ createdAt: -1 })

    return res.json(notes)
  } catch (error) {
    console.error(error);
    
    return res.status(500).json({
      message: error.message,
    })
  }
}
