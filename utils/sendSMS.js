import twilio from 'twilio'

const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN)

const sendSMS = async (to, message) => {
  try {
    const res = await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE,
      to,
    })

    console.log('SMS sent:', res.sid)
  } catch (error) {
    console.log('SMS error:', error.message)
  }
}

export default sendSMS
