import Notification from '../models/Notification.js'

export const getMyNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({
      user: req.user._id,
    })
      .sort({ createdAt: -1 })
      .populate('item')

    res.json(notifications)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}
