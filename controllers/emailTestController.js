import sendEmail from '../utils/sendEmail.js'

// Process-local cooldown; this diagnostic is disabled by default.
let nextAttemptAt = 0

export const sendTestEmail = async (req, res) => {
  res.set('Cache-Control', 'private, no-store')
  if (process.env.EMAIL_TEST_ENABLED !== 'true') {
    return res.status(404).json({ message: 'Email test is disabled' })
  }
  const recipient = process.env.EMAIL_FROM?.trim()
  if (!process.env.BREVO_API_KEY?.trim() || !recipient) {
    return res.status(503).json({ message: 'Brevo email settings are incomplete' })
  }
  const now = Date.now()
  if (now < nextAttemptAt) {
    res.set('Retry-After', String(Math.ceil((nextAttemptAt - now) / 1000)))
    return res.status(429).json({ message: 'Wait before sending another test email' })
  }
  nextAttemptAt = now + 60000

  try {
    // Request data cannot change the recipient or content.
    const result = await sendEmail(
      recipient,
      'Back 2 Owner production email test',
      'This is a delivery test from the Back 2 Owner backend through Brevo. No item or claim was changed.',
    )
    console.info('Email test accepted by Brevo', { messageId: result.messageId })
    return res.status(202).json({
      message: 'Brevo accepted the test email. Check the business inbox and spam folder to confirm delivery.',
      messageId: result.messageId,
    })
  } catch (error) {
    console.error('Email test failed', { name: error.name })
    return res.status(502).json({
      message: 'Email test could not be confirmed. Check Render and Brevo logs before retrying.',
    })
  }
}
