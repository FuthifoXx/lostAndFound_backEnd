import mongoose from 'mongoose'

const counterSchema = mongoose.Schema({
  _id: {
    type: String,
    required: true,
  },
  sequence: {
    type: Number,
    required: true,
    default: 0,
    min: 0,
  },
})

const Counter = mongoose.model('Counter', counterSchema)

export default Counter
