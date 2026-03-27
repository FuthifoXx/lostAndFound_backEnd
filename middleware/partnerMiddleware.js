const partnerOrAdmin = (req, res, next) => {
  if (req.user && (req.user.role === 'admin' || req.user.role === 'partner')) {
    next()
  } else {
    res.status(403).json({ message: 'Only partners/admin can upload items' })
  }
}

export default partnerOrAdmin
