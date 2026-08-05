import { createHash, createHmac } from 'node:crypto'
import { S3Client, type S3File } from 'bun'
import { env } from './env'

// Single place that talks to MinIO/S3 for evidence files. Every upload/serve/
// delete path routes through here so the storage backend lives in one module.
// Bucket must be PRIVATE — access control is enforced by the auth-gated proxy
// (GET /api/evidence/:file), not by object ACL, so never write public-read.

// MINIO_ENDPOINT may be given without a scheme (e.g. "storage.wibudev.com").
// Bun.S3Client needs a full URL, so default to https://.
function normalizeEndpoint(raw: string): string {
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
}

const ENDPOINT = normalizeEndpoint(env.MINIO_ENDPOINT)

const client = new S3Client({
  endpoint: ENDPOINT,
  accessKeyId: env.MINIO_ACCESS_KEY,
  secretAccessKey: env.MINIO_SECRET_KEY,
  bucket: env.MINIO_BUCKET,
})

// Bun.S3Client has no createBucket; sign a PUT to the bucket root ourselves
// (AWS SigV4). Runs once per process — the first putEvidence ensures the bucket
// exists so evidence uploads never fail on a fresh MinIO with "NoSuchBucket".
let bucketEnsured: Promise<void> | null = null

function sha256hex(s: string): string {
  return createHash('sha256').update(s).digest('hex')
}
function hmac(key: Buffer | string, s: string): Buffer {
  return createHmac('sha256', key).update(s).digest()
}

async function createBucket(): Promise<void> {
  const host = new URL(ENDPOINT).host
  const region = 'us-east-1'
  const uri = `/${env.MINIO_BUCKET}/`
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)
  const payloadHash = sha256hex('')
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date'
  const canonicalRequest = ['PUT', uri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n')
  const scope = `${dateStamp}/${region}/s3/aws4_request`
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256hex(canonicalRequest)].join('\n')
  const kSigning = hmac(hmac(hmac(hmac(`AWS4${env.MINIO_SECRET_KEY}`, dateStamp), region), 's3'), 'aws4_request')
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex')
  const authorization = `AWS4-HMAC-SHA256 Credential=${env.MINIO_ACCESS_KEY}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
  const res = await fetch(`${ENDPOINT}${uri}`, {
    method: 'PUT',
    headers: { host, 'x-amz-date': amzDate, 'x-amz-content-sha256': payloadHash, authorization },
  })
  // 200 = created; 409 (BucketAlreadyOwnedByYou) = fine.
  if (res.status !== 200 && res.status !== 409) {
    throw new Error(`Failed to create bucket ${env.MINIO_BUCKET}: HTTP ${res.status}`)
  }
}

function ensureBucket(): Promise<void> {
  if (!bucketEnsured)
    bucketEnsured = createBucket().catch((e) => {
      bucketEnsured = null // allow retry on next call if creation failed
      throw e
    })
  return bucketEnsured
}

// Object key layout mirrors the old on-disk layout so stored URLs stay identical.
export function evidenceKey(taskId: string, storedName: string): string {
  return `evidence/${taskId}/${storedName}`
}

export function avatarKey(userId: string, storedName: string): string {
  return `avatars/${userId}/${storedName}`
}

async function putObject(
  key: string,
  data: Blob | ArrayBuffer | Uint8Array | string,
  contentType?: string,
): Promise<void> {
  await ensureBucket()
  await client.write(key, data, contentType ? { type: contentType } : undefined)
}

export async function putEvidence(
  taskId: string,
  storedName: string,
  data: Blob | ArrayBuffer | Uint8Array | string,
  contentType?: string,
): Promise<void> {
  await putObject(evidenceKey(taskId, storedName), data, contentType)
}

export async function putAvatar(
  userId: string,
  storedName: string,
  data: Blob | ArrayBuffer | Uint8Array | string,
  contentType?: string,
): Promise<void> {
  await putObject(avatarKey(userId, storedName), data, contentType)
}

// Lazy reference — caller checks .exists() then streams via `new Response(s3file)`.
export function getEvidence(taskId: string, storedName: string): S3File {
  return client.file(evidenceKey(taskId, storedName))
}

export function getAvatar(userId: string, storedName: string): S3File {
  return client.file(avatarKey(userId, storedName))
}

// Best-effort delete — never throw (evidence row removal must still succeed).
export async function removeEvidence(taskId: string, storedName: string): Promise<void> {
  await client.delete(evidenceKey(taskId, storedName)).catch(() => {})
}

export async function removeAvatar(userId: string, storedName: string): Promise<void> {
  await client.delete(avatarKey(userId, storedName)).catch(() => {})
}
