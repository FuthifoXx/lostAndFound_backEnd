import express from 'express'
import {
  createPartner,
  getPartners,
  assignUserToPartner,
} from '../controllers/partnerController.js'

import protect from '../middleware/authMiddleware.js'
import admin from '../middleware/adminMiddleware.js'

const router = express.Router()

router.post('/', protect, admin, createPartner)

router.get('/', protect, admin, getPartners)

router.put(
  '/:partnerId/assign-user/:userId',
  protect,
  admin,
  assignUserToPartner,
)

export default router
