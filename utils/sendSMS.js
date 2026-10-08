import twilio from 'twilio'
import normalizePhone from './normalizePhone.js'

export const createSMSSender = (createClient = twilio) => async (to, message) => {
  const phone = normalizePhone(to)
  const client = createClient(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN, {
    timeout: 15000,
    autoRetry: false,
  })
  const response = await client.messages.create({
    body: message,
    from: process.env.TWILIO_PHONE,
    to: phone,
  })

  if (!response?.sid || ['failed', 'undelivered', 'canceled'].includes(response.status)) {
    throw new Error('SMS provider acceptance was not confirmed')
  }
  console.log('SMS accepted by Twilio:', response.sid)

  return response
}

export default createSMSSender()
