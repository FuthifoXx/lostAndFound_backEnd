import express from 'express'
import {
  getAllLostItems,
  addLostItem,
  getMyLostItems
} from '../controllers/lostItemsController.js'
import protect from '../middleware/authmiddleware.js'

const router = express.Router()

// Get all lost items
router.get('/', getAllLostItems)

// Get my lost item
router.get('/my-items', protect, getAllLostItems)

// Add a new lost item
router.post('/', protect, addLostItem)

export default router
