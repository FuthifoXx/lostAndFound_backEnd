import Notification from '../models/Notification.js'
import sendSMS from '../utils/sendSMS.js'
import sendWhatsApp from '../utils/sendWhatsApp.js'
import sendEmail from '../utils/sendEmail.js'

// Store the in-app record even when external delivery fails.
export const createNotifier = ({ sms = sendSMS, whatsapp = sendWhatsApp, email = sendEmail } = {}) => async ({ recipient, item, type, message, legacyChannel, subject, text }) => {
  const configuredChannel = type === 'MATCH_FOUND'
    ? process.env.MATCH_NOTIFICATION_CHANNEL?.trim().toUpperCase()
    : undefined
  const channel = configuredChannel || (process.env.EMAIL_NOTIFICATIONS_ENABLED === 'true'
    ? 'EMAIL'
    : legacyChannel)

  try {
    const notification = await Notification.create({
      user: recipient._id,
      item: item._id,
      type,
      message,
      channel,
    })

    try {
      if (!['EMAIL', 'SMS', 'WHATSAPP'].includes(channel)) {
        throw new Error('Invalid notification channel')
      }
      if (channel === 'EMAIL') {
        if (!recipient.email?.trim()) throw new Error('Recipient email is missing')
        await email(recipient.email.trim(), subject, text)
      } else if (channel === 'SMS') {
        await sms(recipient.phone, `Back 2 Owner: ${text}`)
      } else {
        await whatsapp(recipient.phone, `Back 2 Owner: ${text}`)
      }

      // "sent" means accepted by the provider, not confirmed inbox delivery.
      notification.status = 'sent'
      notification.sentAt = new Date()
    } catch (error) {
      notification.status = 'failed'
      console.error('Notification delivery failed', {
        notificationId: notification._id?.toString(),
        type,
        channel,
        errorName: error.name,
        providerCode: error.code,
      })
    }

    await notification.save()
    return notification
  } catch (error) {
    // Item/claim changes have already been saved; never undo them for email.
    console.error('Notification persistence failed', { type, errorName: error.name })
    return null
  }
}

const notify = createNotifier()

const sendMatchNotification = (user, item) => notify({
  recipient: user,
  item,
  type: 'MATCH_FOUND',
  message: `We have found a match for your ${item.name}`,
  legacyChannel: 'WHATSAPP',
  subject: 'Back 2 Owner: We have found a match',
  text: 'We have found a match. Sign in to Back 2 Owner and open My Items to review your possible item. A match does not complete a claim or collection.',
})

const sendClaimRequestNotification = (item) => notify({
  recipient: item.user,
  item,
  type: 'CLAIM_REQUEST',
  message: `A user requested to claim ${item.name}`,
  legacyChannel: 'SMS',
  subject: 'Back 2 Owner: claim awaiting review',
  text: 'A claim has been requested for an item you uploaded. Sign in to Back 2 Owner and open Claim Requests to review it.',
})

const sendClaimApprovedNotification = (item) => notify({
  recipient: item.matchedUser,
  item,
  type: 'CLAIM_APPROVED',
  message: `Your claim for ${item.name} has been approved`,
  legacyChannel: 'WHATSAPP',
  subject: 'Back 2 Owner: claim approved',
  text: 'Your claim has been approved. Sign in to Back 2 Owner and open My Claims to review the partner and collection details. Approval does not mean the item has already been collected.',
})

const sendClaimRejectedNotification = (item) => notify({
  recipient: item.matchedUser,
  item,
  type: 'CLAIM_REJECTED',
  message: `Your claim for ${item.name} has been rejected`,
  legacyChannel: 'WHATSAPP',
  subject: 'Back 2 Owner: claim update',
  text: 'Your claim was not approved. Sign in to Back 2 Owner and open My Claims to review its status and available next steps.',
})

export default {
  sendMatchNotification,
  sendClaimRequestNotification,
  sendClaimApprovedNotification,
  sendClaimRejectedNotification,
}
