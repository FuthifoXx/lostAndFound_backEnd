const options = {
  experience: ['I have only heard about it', 'I watched a demonstration', 'I have used it myself'],
  lostBefore: ['Yes', 'No', 'Prefer not to say'],
  usefulness: ['Very useful', 'Somewhat useful', 'Not useful', 'Not sure yet'],
  recommend: ['Yes', 'Maybe', 'No'],
  interest: ['Just sharing feedback', 'Help test the app', 'Volunteer in my community', 'Explore becoming a collection partner'],
}
export function validateSurvey(body = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Please provide survey answers.')
  const data = {}
  for (const [key, values] of Object.entries(options)) {
    if (!values.includes(body[key])) throw new Error('Please answer all five required questions.')
    data[key] = body[key]
  }
  for (const [key, limit] of [['feedback', 1000], ['contact', 120]]) {
    if (body[key] !== undefined && (typeof body[key] !== 'string' || body[key].length > limit)) throw new Error(`Please shorten your ${key}.`)
    data[key] = (body[key] || '').trim()
  }
  if (data.contact && body.contactConsent !== true) throw new Error('Please agree to follow-up contact or remove your contact details.')
  data.contactConsent = Boolean(data.contact && body.contactConsent === true)
  if (body.experience !== options.experience[0] && ['Easy', 'Some parts were confusing', 'Difficult', 'Not sure'].includes(body.ease)) data.ease = body.ease
  return data
}
