const admin = (req,res,next)=>{
     console.log('ADMIN CHECK USER', req.user);
     
     if(req.user && req.user.role === 'admin'){
          next()
     }else{
          res.status(403).json({message: 'Admin access only'})
     }
}

export default admin