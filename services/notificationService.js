// import twilio from 'twilio'
// import Notification from '../models/Notification.js'

// const client = twilio(
//   process.env.TWILIO_ACCOUNT_SID,
//   process.env.TWILIO_AUTH_TOKEN,
// )

// // 🔹 Send WhatsApp
// const sendWhatsApp = async (to, message) => {
//   return client.messages.create({
//     from: process.env.TWILIO_WHATSAPP_NUMBER,
//     to: `whatsapp:${to}`,
//     body: message,
//   })
// }

// // 🔹 Send SMS
// const sendSMS = async (to, message) => {
//   return client.messages.create({
//     from: process.env.TWILIO_PHONE,
//     to,
//     body: message,
//   })
// }

// export const sendMatchNotification = async (user, item) => {
//   const message = `Hello ${user.firstNames[0]}, your item was found...`

//   try {
//     await sendWhatsApp(user.phone, message)

//     await Notification.create({
//       user: user._id,
//       type: 'MATCH_FOUND',
//       message,
//       channel: 'WHATSAPP',
//       status: 'sent',
//     })
//   } catch (error) {
//     await Notification.create({
//       user: user._id,
//       type: 'MATCH_FOUND',
//       message,
//       channel: 'WHATSAPP',
//       status: 'failed',
//     })
//   }
// }

// export default {
//   sendWhatsApp,
//   sendSMS,
//   sendMatchNotification,
// }

import Notification from '../models/Notification.js'
import sendSMS from '../utils/sendSMS.js'
import sendWhatsApp from '../utils/sendWhatsApp.js'

//Match Notification
const sendMatchNotification = async (user, item) => {
  const message = `We found a possible match for your ${item.name}`

  try {
    // Save first
    const notification = await Notification.create({
      user: user._id,
      item: item._id,
      type: 'MATCH_FOUND',
      message,
      channel: 'WHATSAPP',
    })

    // Send WhatsApp
    await sendWhatsApp(user.phone, message)

    notification.status = 'sent'
    notification.sentAt = new Date()
    await notification.save()
  } catch (error) {
    console.log('Notification error:', error.message)
  }
}

//Claim Request Notification(to partner)
const sendClaimRequestNotification = async (item) => {
  const message = `A user requested to claim ${item.name}`

  try {
    const notification = await Notification.create({
      user: item.partner,
      item: item._id,
      type: 'CLAIM_REQUEST',
      message,
      channel: 'SMS',
    })

    await sendSMS(item.partner.phone, message)

    notification.status = 'sent'
    notification.sentAt = new Date()
    await notification.save()
  } catch (error) {
    console.log(error)
  }
}

//Claim Approved Notification
const sendClaimApprovedNotification = async (item) => {
  const message = `Your claim for ${item.name} has been approved`

  try {
    const notification = await Notification.create({
      user: item.matchedUser,
      item: item._id,
      type: 'CLAIM_APPROVED',
      message,
      channel: 'WHATSAPP',
    })

    await sendWhatsApp(item.matchedUser.phone, message)

    notification.status = 'sent'
    notification.sentAt = new Date()
    await notification.save()
  } catch (error) {
    console.log(error)
  }
}

export default {
  sendMatchNotification,
  sendClaimRequestNotification,
  sendClaimApprovedNotification,
}