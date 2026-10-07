import nodemailer from 'nodemailer'

const sendEmail = async (to, subject, text) => {
  const apiKey = process.env.BREVO_API_KEY?.trim()
  const from = process.env.EMAIL_FROM?.trim()
  const name = process.env.EMAIL_FROM_NAME?.trim() || 'Back 2 Owner'

  if (apiKey) {
    if (!from) throw new Error('EMAIL_FROM is not configured')
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name, email: from },
        replyTo: { name, email: from },
        to: [{ email: to }],
        subject,
        textContent: text,
      }),
      signal: AbortSignal.timeout(15000),
    })
    // Do not expose provider response bodies or credentials in errors.
    if (!response.ok) {
      throw new Error(`Brevo rejected the email request (HTTP ${response.status})`)
    }
    const result = await response.json()
    if (typeof result.messageId !== 'string' || !result.messageId) {
      throw new Error('Brevo did not return a message ID; check its logs before retrying')
    }
    return { provider: 'brevo', messageId: result.messageId }
  }

  // Gmail is for local development; production must use HTTPS.
  if (process.env.NODE_ENV === 'production' || process.env.RENDER === 'true') {
    throw new Error('BREVO_API_KEY is not configured')
  }
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error('Local email credentials are not configured')
  }
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  })
  const result = await transporter.sendMail({
    from: { name, address: process.env.EMAIL_USER },
    to,
    subject,
    text,
  })
  return { provider: 'gmail', messageId: result.messageId }
}

export default sendEmail
