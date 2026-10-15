const options = {
  seenAppBefore: ['Yes', 'No'],
  replacementFeeFair: ['Yes', 'No'],
  subscribe: ['Yes', 'No', 'Maybe'],
  lostBefore: ['Yes', 'No'],
  usefulness: ['Very useful', 'Somewhat useful', 'Not useful', 'Not sure yet'],
  recommend: ['Yes', 'Maybe', 'No'],
  interest: ['Just sharing feedback', 'Help test the app', 'Volunteer in my community', 'Explore becoming a collection partner'],
}
export function validateSurvey(body = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Please provide survey answers.')
  const data = { surveyVersion: 2 }
  for (const [key, values] of Object.entries(options)) {
    if (!values.includes(body[key])) throw new Error('Please answer all required questions.')
    data[key] = body[key]
  }
  const allowedComfortFactors = ['Strong privacy protection', 'Trusted local collection partners', 'Clear owner-verification process', 'Community / SAPS awareness', 'Reviews from other users', 'Clear explanation of how my information is used']
  if (body.comfortFactors !== undefined) {
    if (!Array.isArray(body.comfortFactors) || body.comfortFactors.some(value => !allowedComfortFactors.includes(value))) throw new Error('Please select valid comfort factors.')
    data.comfortFactors = [...new Set(body.comfortFactors)]
  }
  if (body.comfortOther !== undefined && (typeof body.comfortOther !== 'string' || body.comfortOther.length > 300)) throw new Error('Please shorten your other comfort feedback.')
  data.comfortOther = (body.comfortOther || '').trim()
  for (const [key, limit] of [['feedback', 1000], ['contact', 120]]) {
    if (body[key] !== undefined && (typeof body[key] !== 'string' || body[key].length > limit)) throw new Error(`Please shorten your ${key}.`)
    data[key] = (body[key] || '').trim()
  }
  if (data.contact && body.contactConsent !== true) throw new Error('Please agree to follow-up contact or remove your contact details.')
  data.contactConsent = Boolean(data.contact && body.contactConsent === true)
  const text = (key, limit) => {
    if (typeof body[key] !== 'string' || !body[key].trim() || body[key].length > limit) throw new Error(`Please complete ${key === 'lostItem' ? 'what was lost' : 'how the item was recovered'} (maximum ${limit} characters).`)
    return body[key].trim()
  }
  if (data.lostBefore === 'Yes') {
    data.lostItem = text('lostItem', 300)
    if (!['Yes', 'No'].includes(body.recovered)) throw new Error('Please answer whether the item was recovered.')
    data.recovered = body.recovered
    if (data.recovered === 'Yes') data.recoveryMethod = text('recoveryMethod', 500)
  }
  for (const key of ['queueRating', 'helpDeskRating', 'customerServiceRating', 'willingToPay']) {
    const value = body[key]
    if (key !== 'willingToPay' && (value === undefined || value === '')) continue
    const number = typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value)) ? Number(value) : NaN
    const [min, max] = key === 'willingToPay' ? [20, 100] : [1, 10]
    if (!Number.isInteger(number) || number < min || number > max) throw new Error(`Please enter ${key === 'willingToPay' ? 'an amount from R20 to R100' : 'a rating from 1 to 10'}.`)
    data[key] = number
  }
  return data
}
