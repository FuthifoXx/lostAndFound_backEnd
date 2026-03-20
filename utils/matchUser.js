import User from '../models/User.js'

export const findMatchingUser = async (item) => {
  try {
    let matchedUser = null
    // 1. RSA ID (Strongest match)
    if (item.identityType === 'RSA_ID' && item.idNumber) {
      matchedUser = await User.findOne({
        identityType: 'RSA_ID',
        idNumber: item.idNumber,
      })
    }
    // 2. Passport match
    if (
      !matchedUser &&
      item.identityType === 'PASSPORT' &&
      item.passportNumber
    ) {
      matchedUser = await User.findOne({
        identityType: 'PASSPORT',
        passportNumber: item.passportNumber,
      })
    }
    // 3. Name-based fallback
    if (!matchedUser && item.identityType === 'OTHER') {
      matchedUser = await User.findOne({
        surname: item.surname,
        firstNames: { $in: item.firstNames },
      })
    }

    return matchedUser
  } catch (error) {
    console.log('Matching error:', error)
    return null
  }
}
