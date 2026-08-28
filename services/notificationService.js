import Notification from '../models/Notification.js'
import sendSMS from '../utils/sendSMS.js'
import sendWhatsApp from '../utils/sendWhatsApp.js'

// Match Notification
const sendMatchNotification = async (user, item) => {
  const message = `We found a possible match for your ${item.name}`

  try {
    const notification = await Notification.create({
      user: user._id,
      item: item._id,
      type: 'MATCH_FOUND',
      message,
      channel: 'WHATSAPP',
    })

    try {
      await sendWhatsApp(user.phone, message)

      notification.status = 'sent'
      notification.sentAt = new Date()
    } catch (error) {
      notification.status = 'failed'

      console.error('WhatsApp notification failed:', error.message)
    }

    await notification.save()

    return notification
  } catch (error) {
    console.error('Notification creation failed:', error.message)
    return null
  }
}

// Claim Request Notification (to partner user)
const sendClaimRequestNotification = async (item) => {
  const message = `A user requested to claim ${item.name}`

  try {
    const notification = await Notification.create({
      user: item.user._id,
      item: item._id,
      type: 'CLAIM_REQUEST',
      message,
      channel: 'SMS',
    })

    try {
      await sendSMS(item.user.phone, message)

      notification.status = 'sent'
      notification.sentAt = new Date()
    } catch (error) {
      notification.status = 'failed'

      console.error('SMS notification failed:', error.message)
    }

    await notification.save()

    return notification
  } catch (error) {
    console.error('Claim notification creation failed:', error.message)
    return null
  }
}

// Claim Approved Notification
const sendClaimApprovedNotification = async (item) => {
  const message = `Your claim for ${item.name} has been approved`

  try {
    const notification = await Notification.create({
      user: item.matchedUser._id,
      item: item._id,
      type: 'CLAIM_APPROVED',
      message,
      channel: 'WHATSAPP',
    })

    try {
      await sendWhatsApp(item.matchedUser.phone, message)

      notification.status = 'sent'
      notification.sentAt = new Date()
    } catch (error) {
      notification.status = 'failed'

      console.error(
        'Claim approval WhatsApp notification failed:',
        error.message,
      )
    }

    await notification.save()

    return notification
  } catch (error) {
    console.error(
      'Claim approval notification creation failed:',
      error.message,
    )

    return null
  }
}

export default {
  sendMatchNotification,
  sendClaimRequestNotification,
  sendClaimApprovedNotification,
}
