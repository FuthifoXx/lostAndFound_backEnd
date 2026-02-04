import mongoose from 'mongoose';

const lostItemSchema = mongoose.Schema(
{
     name: {
          type: String, required: true
     },
     description: {
          type: String, required: true
     },
     location: {
          type: String, required: true
     },
     deteLost: {
          type: Date, required: true
     }
     
},
{timestamp: true}
);

const LostItem = mongoose.model('LostItem', lostItemSchema)
export default LostItem;