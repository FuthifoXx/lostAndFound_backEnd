import express from 'express'
import {
  getAllLostItems,
  addLostItem,
} from '../controllers/lostItemsController.js'

const router = express.Router()

// Get all lost items
router.get('/', getAllLostItems)

// Add a new lost item
router.post('/', addLostItem)

export default router
