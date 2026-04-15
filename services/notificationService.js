import twilio from 'twilio'
import Notification from '../models/Notification.js'

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN,
)

// 🔹 Send WhatsApp
const sendWhatsApp = async (to, message) => {
  return client.messages.create({
    from: process.env.TWILIO_WHATSAPP_NUMBER,
    to: `whatsapp:${to}`,
    body: message,
  })
}

// 🔹 Send SMS
const sendSMS = async (to, message) => {
  return client.messages.create({
    from: process.env.TWILIO_PHONE,
    to,
    body: message,
  })
}

export const sendMatchNotification = async (user, item) => {
  const message = `Hello ${user.firstNames[0]}, your item was found...`

  try {
    await sendWhatsApp(user.phone, message)

    await Notification.create({
      user: user._id,
      type: 'MATCH_FOUND',
      message,
      channel: 'WHATSAPP',
      status: 'sent',
    })
  } catch (error) {
    await Notification.create({
      user: user._id,
      type: 'MATCH_FOUND',
      message,
      channel: 'WHATSAPP',
      status: 'failed',
    })
  }
}

export default {
  sendWhatsApp,
  sendSMS,
  sendMatchNotification,
}
