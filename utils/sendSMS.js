import twilio from 'twilio'

const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN)

const sendSMS = async (to, message) => {
  const response = await client.messages.create({
    body: message,
    from: process.env.TWILIO_PHONE,
    to,
  })

  console.log('SMS sent:', response.sid)

  return response
}

export default sendSMS
