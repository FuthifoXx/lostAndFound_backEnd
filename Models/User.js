import mongoose from 'mongoose'

const userSchema = mongoose.Schema(
     {
          idNumber: {
               type: String,
               required: true,
               unique: true,
               match: /^[0-9]{13}$/ //SA ID = 13 digits
          },
          gender: {
               type: String,
               enum: ['male', 'female'],
               required: true
          },
          surname:{
               type: String,
               required: true,
               uppercase: true,
               trim: true
          },
          initials: {
               type: String,
               required: true,
               uppercase: true,
               trim: true
          },
          firstNames:{
                    type: [String],
                    validate: [arr =>arr.length <=3, 'Max 3 name allowed']
               }
          ,
          dateOfBirth:{
               type: Date,
               required: true
          },
          phone: {
               type: String,
               required: true
          },
          email:{
               type: String,
               required: true,
               unique: true,
               lowercase: true,
          },
          password: {type: String, required: true},
          role: {
               type: String,
               enum: ['user', 'admin'],
               default: 'user'
          }
     },
     {timestamps: true}
)

const User = mongoose.model('User', userSchema)
export default User