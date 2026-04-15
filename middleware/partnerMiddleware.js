import Partner from '../models/Partner.js'

const partnerOrAdmin = async (req, res, next) => {
  try {
    // ✅ Admin always allowed
    if (req.user.role === 'admin') {
      return next()
    }

    // ❌ Not a partner
    if (req.user.role !== 'partner') {
      return res
        .status(403)
        .json({ message: 'Only partners/admin can upload items' })
    }

    // ❌ No partner linked
    if (!req.user.partner) {
      return res.status(403).json({ message: 'No partner assigned' })
    }

    const partner = await Partner.findById(req.user.partner)

    // ❌ Partner missing
    if (!partner) {
      return res.status(404).json({ message: 'Partner not found' })
    }

    // ❌ Not verified
    if (!partner.isVerified) {
      return res.status(403).json({ message: 'Partner not verified' })
    }

    next()
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

export default partnerOrAdmin
