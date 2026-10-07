import express from 'express'
import protect from '../middleware/authMiddleware.js'
import admin from '../middleware/adminMiddleware.js'
import { sendTestEmail } from '../controllers/emailTestController.js'
import { getMyNotifications } from '../controllers/notificationController.js'

const router = express.Router()

router.get('/', protect, getMyNotifications)
router.post('/test-email', protect, admin, sendTestEmail)

export default router
