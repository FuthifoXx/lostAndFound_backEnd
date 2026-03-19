import express from 'express'
import {
  getAllLostItems,
  addLostItem,
  getMyLostItems,
  updateLostItem,
  deleteLostItem,
  approveLostItem,
  getPendingItems
} from '../controllers/lostItemsController.js'
import protect from '../middleware/authmiddleware.js'
import admin from '../middleware/adminMiddleware.js'

const router = express.Router()

// Get all lost items
router.get('/', getAllLostItems)

//Get pending items
router.get('/pending', protect, admin, getPendingItems)

// Get my lost item
router.get('/my-items', protect, getMyLostItems)

// Add a new lost item
router.post('/', protect, addLostItem)

// Update a lost item
// TODO Update roles only the admin can update the found & claimed status
router.put('/:id', protect, updateLostItem)

//Delete a lost item
router.delete('/:id', protect, deleteLostItem)

//ApproveLostItem
router.put('/:id/approve', protect, admin, approveLostItem)

export default router
