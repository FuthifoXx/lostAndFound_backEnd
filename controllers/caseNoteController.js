import CaseNote from '../models/CaseNote.js'
import LostItem from '../models/LostItem.js'

export const addCaseNote = async (req, res) => {
  try {
    const item = await LostItem.findById(req.params.id)

    if (!item) {
      return res.status(404).json({
        message: 'Item not found',
      })
    }

    const { note } = req.body

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

    res.status(201).json(caseNote)
  } catch (error) {
    res.status(500).json({
      message: error.message,
    })
  }
}

export const getCaseNotes = async (req, res) => {
  try {
    const notes = await CaseNote.find({
      item: req.params.id,
    })
      .populate('user', 'email firstNames surname role')
      .sort({ createdAt: -1 })

    res.json(notes)
  } catch (error) {
    res.status(500).json({
      message: error.message,
    })
  }
}