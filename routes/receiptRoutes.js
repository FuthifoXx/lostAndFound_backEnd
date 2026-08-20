import express from 'express'
import protect from '../middleware/authMiddleware.js'
import partnerOrAdmin from '../middleware/partnerMiddleware.js'

import {
  createReceipt,
  getReceiptByItem,
  downloadReceiptPDF,
  verifyReceipt,
} from '../controllers/receiptController.js'

const router = express.Router()

router.post('/:itemId', protect, partnerOrAdmin, createReceipt)

router.get('/:itemId/pdf', protect, partnerOrAdmin, downloadReceiptPDF)

router.get('/verify/:receiptNumber', verifyReceipt)

router.get('/:itemId', protect, partnerOrAdmin, getReceiptByItem)

export default router
