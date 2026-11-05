import { parseSAID } from './idParser.js'
export const cleanText = (value, max = 120) =>
  typeof value === 'string' && value.trim().length <= max ? value.trim() : ''
export const escapeRegex = (value) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
export const hasExactDetails = (user) =>
  Boolean(
    user.identityType &&
    {
      RSA_ID: user.idNumber,
      PASSPORT: user.passportNumber,
      OTHER: user.documentNumber,
    }[user.identityType],
  )
export const safeProfile = (user) => {
  const value = user.toObject ? user.toObject() : { ...user }
  const exactMatching = value.matchingActive !== false && hasExactDetails(value)
  for (const key of [
    'password',
    'authVersion',
    'idNumber',
    'passportNumber',
    'documentNumber',
    'gender',
  ])
    delete value[key]
  return {
    ...value,
    emailConfirmed: Boolean(user.emailVerifiedAt),
    exactMatching,
    candidateMatching: Boolean(user.candidateMatching),
  }
}
export const parseRecoveryProfile = (body = {}) => {
  if (body.consent !== true)
    throw new Error(
      'Please choose whether to enable private recovery matching.',
    )
  const firstNames = cleanText(body.firstNames).split(/\s+/).filter(Boolean)
  const surname = cleanText(body.surname)
  const identityType = body.identityType
  if (
    !firstNames.length ||
    firstNames.length > 3 ||
    !surname ||
    !['RSA_ID', 'PASSPORT', 'OTHER'].includes(identityType)
  )
    throw new Error('Enter the document type, first names and surname.')
  const mode = body.mode
  if (!['possible', 'exact'].includes(mode))
    throw new Error('Choose possible matching or exact document matching.')
  let dateOfBirth
  if (body.dateOfBirth) {
    if (
      typeof body.dateOfBirth !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(body.dateOfBirth)
    )
      throw new Error('Enter a valid date of birth.')
    dateOfBirth = new Date(body.dateOfBirth + 'T00:00:00.000Z')
    if (
      Number.isNaN(dateOfBirth.getTime()) ||
      dateOfBirth.toISOString().slice(0, 10) !== body.dateOfBirth ||
      dateOfBirth > new Date() ||
      dateOfBirth < new Date('1900-01-01')
    )
      throw new Error('Enter a valid date of birth.')
  }
  if (mode === 'possible' && !dateOfBirth)
    throw new Error(
      'Date of birth is needed for possible matching. You can also choose exact document matching.',
    )
  const data = {
    identityType,
    firstNames,
    surname: surname.toUpperCase(),
    initials: firstNames
      .map((name) => name[0])
      .join('')
      .toUpperCase(),
    ...(dateOfBirth ? { dateOfBirth } : {}),
  }
  let identityFilter
  if (mode === 'exact') {
    const field = {
      RSA_ID: 'idNumber',
      PASSPORT: 'passportNumber',
      OTHER: 'documentNumber',
    }[identityType]
    const value = cleanText(body[field], 80).toUpperCase()
    if (!value || value.length < 3)
      throw new Error(
        'Enter the full document number privately to enable exact matching.',
      )
    if (identityType === 'RSA_ID') {
      const parsed = parseSAID(value)
      if (!parsed.dateOfBirth || parsed.dateOfBirth > new Date())
        throw new Error('Enter a valid RSA ID number.')
      if (dateOfBirth && parsed.dateOfBirth.getTime() !== dateOfBirth.getTime())
        throw new Error('The date of birth does not match the ID number.')
      data.dateOfBirth = parsed.dateOfBirth
    }
    data[field] = value
    identityFilter = { identityType, [field]: value }
  }
  return { data, identityFilter, mode }
}
export const possibleFilter = (user) => {
  if (
    !user.emailVerifiedAt ||
    !user.candidateMatching ||
    !user.dateOfBirth ||
    !user.firstNames?.length ||
    !user.surname
  )
    return null
  const start = new Date(user.dateOfBirth)
  start.setUTCHours(0, 0, 0, 0)
  const end = new Date(start.getTime() + 86400000)
  return {
    approved: true,
    status: 'approved',
    matchedUser: null,
    identityType: user.identityType,
    surname: {
      $regex: '^' + escapeRegex(user.surname.trim()) + '$',
      $options: 'i',
    },
    firstNames: {
      $all: user.firstNames.map(
        (name) => new RegExp('^' + escapeRegex(name.trim()) + '$', 'i'),
      ),
    },
    dateOfBirth: { $gte: start, $lt: end },
  }
}
