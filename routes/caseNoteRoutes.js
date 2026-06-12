import express from 'express'

import { addCaseNote, getCaseNotes } from '../controllers/caseNoteController.js'

import protect from '../middleware/authMiddleware.js'
import partnerOrAdmin from '../middleware/partnerMiddleware.js'

const router = express.Router()

router.post('/:id/notes', protect, partnerOrAdmin, addCaseNote)

router.get('/:id/notes', protect, partnerOrAdmin, getCaseNotes)

export default router
