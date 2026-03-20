export const parseSAID = (idNumber) => {
  if (!idNumber) return {}

  if (!/^[0-9]{13}$/.test(idNumber)) {
    throw new Error('Invalid SA ID number')
  }

  const year = idNumber.substring(0, 2)
  const month = idNumber.substring(2, 4)
  const day = idNumber.substring(4, 6)

  const currentYear = new Date().getFullYear().toString().slice(2)
  const fullYear = year <= currentYear ? `20${year}` : `19${year}`

  const dateOfBirth = new Date(`${fullYear}-${month}-${day}`)

  const genderDigits = parseInt(idNumber.substring(6, 10))
  const gender = genderDigits >= 5000 ? 'male' : 'female'

  return { dateOfBirth, gender }
}
