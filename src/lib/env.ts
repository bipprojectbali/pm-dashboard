function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback
}

function required(key: string): string {
  const value = process.env[key]
  if (!value) throw new Error(`Missing required environment variable: ${key}`)
  return value
}

export const env = {
  PORT: parseInt(optional('PORT', '3000'), 10),
  NODE_ENV: optional('NODE_ENV', 'development'),
  REACT_EDITOR: optional('REACT_EDITOR', 'code'),
  DATABASE_URL: required('DATABASE_URL'),
  REDIS_URL: required('REDIS_URL'),
  GOOGLE_CLIENT_ID: required('GOOGLE_CLIENT_ID'),
  GOOGLE_CLIENT_SECRET: required('GOOGLE_CLIENT_SECRET'),
  BETTER_AUTH_SECRET: required('BETTER_AUTH_SECRET'),
  BETTER_AUTH_URL: optional('BETTER_AUTH_URL', 'http://localhost:3000'),
  SUPER_ADMIN_EMAILS: optional('SUPER_ADMIN_EMAIL', '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean),
  AUDIT_LOG_RETENTION_DAYS: parseInt(optional('AUDIT_LOG_RETENTION_DAYS', '90'), 10),
  MCP_SECRET: optional('MCP_SECRET', ''),
  GITHUB_WEBHOOK_SECRET: optional('GITHUB_WEBHOOK_SECRET', ''),
  UPLOADS_DIR: optional('UPLOADS_DIR', './uploads'),
  UPLOAD_MAX_BYTES: parseInt(optional('UPLOAD_MAX_BYTES', String(10 * 1024 * 1024)), 10),
  // MinIO / S3-compatible object storage for evidence files. required() → app
  // crash-fasts at boot if unset (like DATABASE_URL). Set these in Portainer for
  // stg/prod before deploying this version.
  MINIO_ENDPOINT: required('MINIO_ENDPOINT'),
  MINIO_ACCESS_KEY: required('MINIO_ACCESS_KEY'),
  MINIO_SECRET_KEY: required('MINIO_SECRET_KEY'),
  MINIO_BUCKET: optional('MINIO_BUCKET', 'pm-dashboard'),
} as const
