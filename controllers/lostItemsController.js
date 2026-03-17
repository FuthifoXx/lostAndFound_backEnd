import mongoose from 'mongoose'
import LostItem from '../models/LostItem.js'

// Get all lost items
export const getAllLostItems = async (req, res) => {
  try {
    const lostItems = await LostItem.find({approved: true}).populate('user', 'name email')

    res.json(lostItems)
  } catch (error) {
    res.status(500).json({ message: 'Server error' })
  }
}

//Get only items created by the us
export const getMyLostItems = async (req, res) => {
  try {
    const items = await LostItem.find({ user: req.user._id }).populate(
      'user',
      'name email',
    )
    res.json(items)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// Create a lost item
export const addLostItem = async (req, res) => {
  const { name, description, location, dateLost } = req.body

  if (!name || !description || !location || !dateLost) {
    return res.status(400).json({ message: 'All fields are required' })
  }

  try {
    const newItem = await LostItem.create({
      user: req.user._id,
      name,
      description,
      location,
      dateLost: new Date(dateLost),
    })

    res.status(201).json(newItem)
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
    if (item.user.toString() !== req.user._id.toString()) {
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

// Delete a lost item
export const deleteLostItem = async (req, res) => {
  try {
    const item = await LostItem.findById(req.params.id)

    if (!item) {
      return res.status(404).json({ message: 'Item not found' })
    }

    //Ownership check
    if (item.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
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

    if(!item){
      return res.status(404).json({message: 'Item not found'})
    }

    item.approved = true

    const updatedItem = await item.save()
    res.json(updatedItem)
  } catch (error) {
    res.status(500).json({message: error.message})
  }
}
