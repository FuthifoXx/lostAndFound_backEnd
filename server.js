import express from 'express'
import dotenv from 'dotenv'
import cors from 'cors'

dotenv.config()

import connectDB from './config/db.js'
import lostItemsRoutes from './routes/lostItems.js'
import authRoutes from './routes/authRoutes.js'
import partnerRoutes from './routes/partnerRoutes.js'
import notifictionRoutes from './routes/notificationRoutes.js'
import caseNoteRoutes from './routes/caseNoteRoutes.js'
import receiptRoutes from './routes/receiptRoutes.js'

const app = express()
const PORT = process.env.PORT || 5000

const allowedOrigins = (
  process.env.CORS_ORIGINS ||
  process.env.FRONTEND_URL ||
  'http://localhost:5173'
)
  .split(',')
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean)

// Middleware
app.use(
  cors({
    origin(origin, callback) {
      // Requests without an Origin header include health checks and server-to-server calls.
      if (!origin || allowedOrigins.includes(origin.replace(/\/$/, ''))) {
        return callback(null, true)
      }

      return callback(new Error('Origin is not allowed by CORS'))
    },
  }),
)

app.use(express.json())

// Routes
app.use('/api/lost-items', lostItemsRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/partners', partnerRoutes)
app.use('/api/notifications', notifictionRoutes)
app.use('/api/case-notes', caseNoteRoutes)
app.use('/api/receipts', receiptRoutes)

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok' })
})

// Test route
app.get('/', (req, res) => {
  res.send('Lost & Found App API is running 🚀')
})

// Start server
const startServer = async () => {
  await connectDB()

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`)
  })
}

startServer()
