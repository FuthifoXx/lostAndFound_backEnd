import twilio from 'twilio'

const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN)

const sendWhatsApp = async (to, message) => {
  try {
    const res = await client.messages.create({
      body: message,
      from: process.env.TWILIO_WHATSAPP_NUMBER,
      to: `whatsapp:${to}`, // IMPORTANT
    })

    console.log('WhatsApp sent:', res.sid)
  } catch (error) {
    console.log('WhatsApp error:', error.message)
  }
}

export default sendWhatsApp
