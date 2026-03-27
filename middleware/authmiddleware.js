import jwt from 'jsonwebtoken'
import User from '../models/User.js'

const protect = async (req,res,next) => {
     let token 
     if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')
     ){
          try {
               token = req.headers.authorization.split(' ')[1].trim()

               const decoded = jwt.verify(token, process.env.JWT_SECRET)

               req.user = await User.findById(decoded.id).select('-password')
               console.log(req.user);
               
               if(!req.user){
                    return res.status(401).json({message: 'User not found'})
               }

               next()
          } catch (error) {
               console.log("JWT ERROR:",error.message);
               
               res.status(401).json({message: 'Not authorized, token failed'})
          }
     }
     // if(!token){
     //      return res.status(401).json({message: 'Not authorized, no token'})
     // }
       if (!token) {
         return res.status(401).json({ message: 'Not authorized, no token' })
       }
       console.log("TOKEN:", token);
       console.log('AUTH HEADER:', req.headers.authorization)
       
}

export default protect