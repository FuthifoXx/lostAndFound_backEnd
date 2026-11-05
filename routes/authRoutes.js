import express from 'express'
import {
  registerUser,
  loginUser,
  getMe,
  updateMe,
  deleteMe,
  getAllUsers,
  getUserById,
  updateUserById,
  deleteUserById,
} from '../controllers/authController.js'

import { forgotPassword, resetPassword, recoveryLimit, progressiveLimit } from '../controllers/passwordResetController.js'

import { requestVerification, verifyEmail, saveRecoveryProfile, getPossibleMatches, getLossReports, createLossReport } from '../controllers/recoveryProfileController.js'

import protect from '../middleware/authMiddleware.js'
import admin from '../middleware/adminMiddleware.js'

const router = express.Router()

router.post('/register', progressiveLimit, registerUser)
router.post('/verify-email', progressiveLimit, verifyEmail)
router.post('/email-confirmation', protect, progressiveLimit, requestVerification)
router.put('/recovery-profile', protect, progressiveLimit, saveRecoveryProfile)
router.get('/possible-matches', protect, getPossibleMatches)
router.get('/loss-reports', protect, getLossReports)
router.post('/loss-reports', protect, progressiveLimit, createLossReport)
router.post('/login', loginUser)
router.post('/forgot-password', recoveryLimit, forgotPassword)
router.post('/reset-password', recoveryLimit, resetPassword)

router.get('/me', protect, getMe)
router.put('/me', protect, updateMe)
router.delete('/me', protect, deleteMe)
// POST /api/auth/register
// POST /api/auth/login
// GET /api/auth/me
// PUT /api/auth/me
// DELETE /api/auth/me

router.get('/users', protect, admin, getAllUsers)
router.get('/users/:id', protect, admin, getUserById)
router.put('/users/:id', protect, admin, updateUserById)
router.delete('/users/:id', protect, admin, deleteUserById)
// GET /api/auth/users
// GET /api/auth/users/:id
// PUT /api/auth/users/:id
// DELETE /api/auth/users/:id

export default router