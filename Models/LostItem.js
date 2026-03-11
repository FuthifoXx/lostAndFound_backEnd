import mongoose from 'mongoose';

const lostItemSchema = mongoose.Schema(
{
     user: {
          type: mongoose.Schema.Types.ObjectId,
          required: true,
          ref: 'User',
     },
     name: {
          type: String, required: true
     },
     description: {
          type: String, required: true
     },
     location: {
          type: String, required: true
     },
     dateLost: {
          type: Date, required: true
     }
     
},
{timestamps: true}
);

const LostItem = mongoose.model('LostItem', lostItemSchema)
export default LostItem;