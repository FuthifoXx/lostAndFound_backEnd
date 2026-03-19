import express from 'express'
import Partner from '../models/Partner'
import protect from '../middleware/authmiddleware'
import admin from '../middleware/adminMiddleware'

const router = express.Router()

//Create partner (admin only)
router.post('/', protect, admin, async (req, res) => {
     try {
          const partner = await Partner.create(req.body)
          res.status(201).json(partner)
     } catch (error) {
          res.status(500).json({message: error.message})
     }
})

//Get all partners
router.get('/', async (req, res) => {
     const partners = await Partner.find()
     res.json(partners)
})

export default router