import LostItem from '../models/LostItem.js'
// Get all lost items
export const getAllLostItems = async (req, res) => {
  try {
    const lostItems = await LostItem.find({})
    res.json(lostItems)
  } catch (error) {
    res.status(500).json({ message: 'Server error' })
  }
}

export const addLostItem = async (req, res) => {
  const { name, description, location, dateLost } = req.body

  if (!name || !description || !location || !dateLost) {
    return res.status(400).json({ message: 'All fields are required' })
  }

  try {
    const newItem = await LostItem.create({
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
