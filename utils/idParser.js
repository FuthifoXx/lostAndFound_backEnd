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

  const numericYear = Number(fullYear)
  const numericMonth = Number(month)
  const numericDay = Number(day)

  const dateOfBirth = new Date(
    Date.UTC(numericYear, numericMonth - 1, numericDay),
  )

  const isValidDate =
    dateOfBirth.getUTCFullYear() === numericYear &&
    dateOfBirth.getUTCMonth() === numericMonth - 1 &&
    dateOfBirth.getUTCDate() === numericDay

  if (!isValidDate) {
    throw new Error('Invalid SA ID number')
  }

  const genderDigits = parseInt(idNumber.substring(6, 10))
  const gender = genderDigits >= 5000 ? 'male' : 'female'

  return { dateOfBirth, gender }
}
