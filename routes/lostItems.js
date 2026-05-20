import express from 'express'

import {
  getAllLostItems,
  addLostItem,
  getMyLostItems,
  updateLostItem,
  deleteLostItem,
  approveLostItem,
  getPendingItems,
  requestClaim,
  approveClaim,
  rejectClaim,
  getLostItemById,
  getPendingClaims,
} from '../controllers/lostItemsController.js'

import protect from '../middleware/authMiddleware.js'
import partnerOrAdmin from '../middleware/partnerMiddleware.js'
import admin from '../middleware/adminMiddleware.js'
import upload from '../middleware/uploadMiddleware.js'

const router = express.Router()

// Get all lost items
router.get('/', getAllLostItems)

// Get pending items
router.get('/pending', protect, admin, getPendingItems)

// Get my items
router.get('/my-items', protect, getMyLostItems)

// Get pending claims
router.get('/pending-claims', protect, getPendingClaims)

// Add item
router.post('/', protect, partnerOrAdmin, upload.single('image'), addLostItem)

// Update item
router.put('/:id', protect, updateLostItem)

// Delete item
router.delete('/:id', protect, deleteLostItem)

// Approve item
router.put('/:id/approve', protect, admin, approveLostItem)

// Request claim
router.put('/:id/claim', protect, requestClaim)

// Approve claim
router.put('/:id/approve-claim', protect, partnerOrAdmin, approveClaim)

// Reject claim
router.put('/:id/reject-claim', protect, partnerOrAdmin, rejectClaim)

// Get single item 
router.get('/:id', getLostItemById)

export default router
