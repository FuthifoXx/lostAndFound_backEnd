import Notification from '../models/Notification.js'

export const getMyNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({
      user: req.user._id,
    })
      .populate('item')
      .sort({ createdAt: -1 })

    res.json(notifications)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}
