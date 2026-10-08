import twilio from 'twilio'
import normalizePhone from './normalizePhone.js'

const sendWhatsApp = async (to, message) => {
  const phone = normalizePhone(to)
  const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN, {
    timeout: 15000,
    autoRetry: false,
  })
  const response = await client.messages.create({
    body: message,
    from: process.env.TWILIO_WHATSAPP_NUMBER,
    to: `whatsapp:${phone}`,
  })

  console.log('WhatsApp accepted by Twilio:', response.sid)

  return response
}

export default sendWhatsApp
