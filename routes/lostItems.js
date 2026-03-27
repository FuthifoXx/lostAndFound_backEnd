import express from 'express'
import {
  getAllLostItems,
  addLostItem,
  getMyLostItems,
  updateLostItem,
  deleteLostItem,
  approveLostItem,
  getPendingItems,
} from '../controllers/lostItemsController.js'
import protect from '../middleware/authMiddleware.js'
import partnerOrAdmin from '../middleware/partnerMiddleware.js'
import admin from '../middleware/adminMiddleware.js'
import upload from '../middleware/uploadMiddleware.js'

const router = express.Router()

// Get all lost items
router.get('/', getAllLostItems)

//Get pending items
router.get('/pending', protect, admin, getPendingItems)

// Get my lost item
router.get('/my-items', protect, getMyLostItems)

// Add a new lost item
// router.post('/', protect, addLostItem)

//Upload image
router.post('/', protect, partnerOrAdmin, upload.single('image'), addLostItem)

// Update a lost item
router.put('/:id', protect, updateLostItem)



















































//Delete a lost item
router.delete('/:id', protect, deleteLostItem)

//ApproveLostItem
router.put('/:id/approve', protect, admin, approveLostItem)

export default router
