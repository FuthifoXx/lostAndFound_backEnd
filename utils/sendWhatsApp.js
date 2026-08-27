import twilio from 'twilio'

const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN)

const sendWhatsApp = async (to, message) => {
  const response = await client.messages.create({
    body: message,
    from: process.env.TWILIO_WHATSAPP_NUMBER,
    to: `whatsapp:${to}`,
  })

  console.log('WhatsApp sent:', response.sid)

  return response
}

export default sendWhatsApp
