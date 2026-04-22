// import express from 'express'
// import { protect } from '../middleware/authMiddleware.js'
// import { getMyNotifications } from '../controllers/notificationController.js'

// const router = express.Router()

// router.get('/', protect, getMyNotifications)

// export default router

import express from 'express'
import Notification from '../models/Notification.js'
import protect from '../middleware/authMiddleware.js'

const router = express.Router()

// Get my notifications
router.get('/', protect, async (req, res) => {
  const notifications = await Notification.find({ user: req.user._id })
    .sort({ createdAt: -1 })
    .populate('item', 'name location')

  res.json(notifications)
})

export default router