const options = {
  seenAppBefore: ['Yes', 'No'],
  replacementFeeFair: ['Yes', 'No', 'Not sure'],
  subscribe: ['Yes', 'No', 'Maybe'],
  lostBefore: ['Yes', 'No'],
  keepInTouch: ['Yes', 'No'],
  usefulness: ['Very useful', 'Somewhat useful', 'Not useful', 'Not sure yet'],
  recommend: ['Yes', 'Maybe', 'No'],
  interest: ['Just sharing feedback', 'Help test the app', 'Volunteer in my community', 'Explore becoming a collection partner'],
}
export function validateSurvey(body = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Please provide survey answers.')
  const data = { surveyVersion: 3 }
  for (const [key, values] of Object.entries(options)) {
    if (!values.includes(body[key])) throw new Error('Please answer all required questions.')
    data[key] = body[key]
  }
  for (const [key, limit] of [['feedback', 1000], ['contact', 120], ['firstNames', 100], ['surname', 100]]) {
    if (body[key] !== undefined && (typeof body[key] !== 'string' || body[key].length > limit)) throw new Error(`Please shorten your ${key}.`)
    data[key] = (body[key] || '').trim()
  }
  if (body.researchConsent !== true) throw new Error('Please obtain the respondent’s consent before saving.')
  data.researchConsent = true
  data.consentVersion = 'community-pilot-v3'
  data.contactConsent = data.keepInTouch === 'Yes'
  if (data.contactConsent && !data.contact) throw new Error('Please provide a phone number or email for follow-up contact.')
  if (!data.contactConsent) data.contact = ''
  const allowedComfort = ['Strong privacy protection', 'Trusted local collection partners', 'Clear owner-verification process', 'Community/SAPS awareness', 'Reviews from other users', 'Clear explanation of how my information is used', 'Other']
  if (body.comfortFactors !== undefined && (!Array.isArray(body.comfortFactors) || body.comfortFactors.length > allowedComfort.length || body.comfortFactors.some(value => !allowedComfort.includes(value)))) throw new Error('Please select valid comfort factors.')
  data.comfortFactors = [...new Set(body.comfortFactors || [])]
  if (data.comfortFactors.includes('Other')) {
    if (typeof body.comfortOther !== 'string' || !body.comfortOther.trim() || body.comfortOther.length > 1000) throw new Error('Please describe the other comfort factor (maximum 1000 characters).')
    data.comfortOther = body.comfortOther.trim()
  }
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
    const number = typeof value === 'number' || (typeof value === 'string' && /^\d+(?:\.\d{1,2})?$/.test(value)) ? Number(value) : NaN
    const [min, max] = key === 'willingToPay' ? [0, Number.MAX_SAFE_INTEGER / 100] : [1, 10]
    if (!Number.isFinite(number) || (key !== 'willingToPay' && !Number.isInteger(number)) || (key === 'willingToPay' && Math.abs(number * 100 - Math.round(number * 100)) > 0.000001) || number < min || number > max) throw new Error(`Please enter ${key === 'willingToPay' ? 'a non-negative rand amount with at most two decimal places' : 'a rating from 1 to 10'}.`)
    data[key] = number
  }
  return data
}
