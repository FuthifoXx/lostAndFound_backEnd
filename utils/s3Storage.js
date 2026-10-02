import { randomUUID } from 'node:crypto'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import s3 from '../config/s3.js'

const getBucketName = () => {
  const bucketName = process.env.AWS_S3_BUCKET_NAME

  if (!bucketName) {
    throw new Error('AWS_S3_BUCKET_NAME is not configured')
  }

  return bucketName
}

export const uploadPrivateDocument = async ({
  buffer,
  contentType,
  extension,
}) => {
  const prefix = process.env.AWS_S3_KEY_PREFIX || 'lost-items'
  const key = `${prefix}/${randomUUID()}.${extension}`

  await s3.send(
    new PutObjectCommand({
      Bucket: getBucketName(),
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: 'private, no-store',
      ServerSideEncryption: 'AES256',
    }),
  )

  return key
}

export const createPrivateDocumentUrl = async (key, expiresIn = 120) => {
  if (!key) return null

  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: getBucketName(),
      Key: key,
      ResponseCacheControl: 'private, no-store',
    }),
    { expiresIn },
  )
}

export const deletePrivateDocument = async (key) => {
  if (!key) return

  await s3.send(
    new DeleteObjectCommand({
      Bucket: getBucketName(),
      Key: key,
    }),
  )
}
