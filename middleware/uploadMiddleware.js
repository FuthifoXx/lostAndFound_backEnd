import multer from 'multer'

const storage = multer.memoryStorage()

const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])

const fileFilter = (req, file, callback) => {
  if (allowedMimeTypes.has(file.mimetype)) {
    return callback(null, true)
  }

  const error = new Error('Only JPEG, PNG, and WebP images are allowed')
  error.statusCode = 400
  return callback(error)
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
})

export default upload
