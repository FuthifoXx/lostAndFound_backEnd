import express from 'express'
import dotenv from 'dotenv'
import connectDB from './config/db.js'
import lostItemsRoutes from './routes/lostItems.js'
import authRoutes from './routes/authRoutes.js'
import partnerRoutes from './routes/partnerRoutes.js'

dotenv.config()

//Connect to MongoDB
connectDB()

const app = express()
const PORT = process.env.PORT || 5000

// Middleware
app.use(express.json())

// Routes
app.use('/api/lost-items', lostItemsRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/partners', partnerRoutes)

// Test route
app.get('/', (req, res) => {
  res.send('Lost & Found App API is running 🚀')
})

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
