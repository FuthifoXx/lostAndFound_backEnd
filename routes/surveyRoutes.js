import express from 'express'
import SurveyResponse from '../models/SurveyResponse.js'
import protect from '../middleware/authMiddleware.js'
import admin from '../middleware/adminMiddleware.js'
import { validateSurvey } from '../utils/validateSurvey.js'

const router = express.Router()
router.post('/', protect, admin, async (req, res, next) => {
  let data
  try { data = validateSurvey(req.body) }
  catch (error) { return res.status(400).json({ message: error.message }) }
  try {
    await SurveyResponse.create(data)
    return res.status(201).json({ message: 'Thank you. Your feedback has been saved.' })
  } catch (error) { next(error) }
})
router.get('/', protect, admin, async (req, res, next) => {
  try {
    const page = Math.max(1, Math.min(10000, Number.parseInt(req.query.page, 10) || 1))
    const [responses, total] = await Promise.all([
      SurveyResponse.find().sort({ createdAt: -1, _id: -1 }).skip((page - 1) * 20).limit(20).lean(),
      SurveyResponse.countDocuments(),
    ])
    res.json({ responses, total, page, pages: Math.ceil(total / 20) })
  } catch (error) { next(error) }
})
export default router
