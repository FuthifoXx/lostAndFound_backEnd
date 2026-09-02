import Partner from '../models/Partner.js'
import User from '../models/User.js'

export const createPartner = async (req, res) => {
  try {
    const { name, branch, address, contact } = req.body

    if (!name || !branch || !address) {
      return res.status(400).json({
        message: 'Name, branch and address are required',
      })
    }

    const existingPartner = await Partner.findOne({
      name: name.trim(),
      branch: branch.trim(),
    }).collation({
      locale: 'en',
      strength: 2,
    })

    if (existingPartner) {
      return res.status(409).json({
        message: 'This partner branch already exists',
        partnerId: existingPartner._id,
      })
    }

    const partner = await Partner.create({
      name: name.trim(),
      branch: branch.trim(),
      address: address.trim(),
      contact: contact?.trim(),
    })

    return res.status(201).json(partner)
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: 'This partner branch already exists',
      })
    }

    console.error(error);
    
    return res.status(500).json({ message: error.message })
  }
}

export const getPartners = async (req, res) => {
  try {
    const partners = await Partner.find().sort({ createdAt: -1 })
    res.json(partners)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

export const assignUserToPartner = async (req, res) => {
  try {
    const { partnerId, userId } = req.params

    const partner = await Partner.findById(partnerId)

    if (!partner) {
      return res.status(404).json({ message: 'Partner not found' })
    }

    const user = await User.findById(userId)

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    user.role = 'partner'
    user.partner = partner._id

    await user.save()

    res.json({
      message: 'User assigned to partner successfully',
      user: {
        _id: user._id,
        email: user.email,
        role: user.role,
        partner: user.partner,
      },
      partner,
    })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

export const verifyPartner = async (req, res) => {
  try {
    const partner = await Partner.findById(req.params.id)

    if (!partner) {
      return res.status(404).json({ message: 'Partner not found' })
    }

    partner.isVerified = true

    const updatedPartner = await partner.save()

    res.json(updatedPartner)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}
