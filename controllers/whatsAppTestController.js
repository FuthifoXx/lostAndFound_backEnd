import sendWhatsApp from '../utils/sendWhatsApp.js'

export const createWhatsAppTestHandler = (send = sendWhatsApp, now = Date.now) => {
  // Process-local cooldown; diagnostic stays disabled outside supervised testing.
  let nextAttemptAt = 0
  return async (req, res) => {
    res.set('Cache-Control', 'private, no-store')
    if (process.env.WHATSAPP_TEST_ENABLED !== 'true') {
      return res.status(404).json({ message: 'WhatsApp test is disabled' })
    }
    const recipient = process.env.WHATSAPP_TEST_TO?.trim()
    if (!/^\+[1-9]\d{7,14}$/.test(recipient || '') ||
        !process.env.TWILIO_SID?.trim() || !process.env.TWILIO_AUTH_TOKEN?.trim() ||
        !/^whatsapp:\+[1-9]\d{7,14}$/.test(process.env.TWILIO_WHATSAPP_NUMBER?.trim() || '')) {
      return res.status(503).json({ message: 'WhatsApp test settings are incomplete or invalid' })
    }
    const timestamp = now()
    if (timestamp < nextAttemptAt) {
      res.set('Retry-After', String(Math.ceil((nextAttemptAt - timestamp) / 1000)))
      return res.status(429).json({ message: 'Wait before sending another WhatsApp test' })
    }
    nextAttemptAt = timestamp + 60000
    try {
      // Never accept recipient or message overrides from request data.
      const result = await send(recipient,
        'Back 2 Owner: This is a WhatsApp delivery test from our backend. No item or claim was changed.')
      if (!result?.sid || ['failed', 'undelivered', 'canceled'].includes(result.status)) {
        throw new Error('Message acceptance not confirmed')
      }
      return res.status(202).json({
        message: 'Twilio accepted the test. Check WhatsApp to confirm delivery.',
        messageId: result.sid,
        providerStatus: result.status,
      })
    } catch (error) {
      const providerCode = Number.isInteger(error.code) ? error.code : undefined
      console.error('WhatsApp test could not be confirmed', { name: error.name, providerCode })
      return res.status(502).json({
        message: 'WhatsApp delivery could not be confirmed. Check Twilio messaging logs before retrying.',
        providerCode,
      })
    }
  }
}

export const sendTestWhatsApp = createWhatsAppTestHandler()
