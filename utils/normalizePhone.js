// Accept South African local numbers and international E.164 numbers.
export default function normalizePhone(value) {
  if (typeof value !== 'string') throw new Error('Phone number is required')
  let phone = value.trim().replace(/[\s().-]/g, '')
  if (/^0\d{9}$/.test(phone)) phone = `+27${phone.slice(1)}`
  else if (/^27\d{9}$/.test(phone)) phone = `+${phone}`
  else if (/^00[1-9]\d{7,14}$/.test(phone)) phone = `+${phone.slice(2)}`
  if (!/^\+[1-9]\d{7,14}$/.test(phone) ||
      (phone.startsWith('+27') && !/^\+27[1-9]\d{8}$/.test(phone))) {
    throw new Error('Use a valid local South African or international phone number')
  }
  return phone
}
