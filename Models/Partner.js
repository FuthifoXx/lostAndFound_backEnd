import mongoose from 'mongoose'

const partnerSchema = mongoose.Schema(
     {
          name: {
               type: String,
               required: true
          },
          branch: {
               type: String,//e.g. "Johannesburg CBD"
               required: true
          },
          address: {
               type: String,
               required: true
          },
          contact: {
               type: String
          }
     },
     {Timestamp: true}
)

const Partner = mongoose.model('Partner', partnerSchema)

export default Partner