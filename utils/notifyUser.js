import Notification from '../models/Notification.js'
export const notifyUser = async (user, item) => {
  try {
    const message = `Hi ${user.firstNames?.[0] || ''}, your lost item may have been found at ${item.location}. Please verify with admin.`

    await Notification.create({
      user: user._id,
      item: item._id,
      message,
    })

    console.log('🔔 Notification saved to DB')
  } catch (error) {
    console.log('Notification error:', error)
  }
}
