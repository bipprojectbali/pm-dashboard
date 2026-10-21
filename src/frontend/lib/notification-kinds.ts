// Satu-satunya salinan frontend dari enum Prisma NotificationKind. Tiap map
// yang di-key `Record<NotificationKind, ...>` otomatis gagal compile saat enum
// bertambah — sebelumnya daftar ini disalin tangan di tiap komponen, sehingga
// kind baru lolos ke runtime dan meledak saat lookup. Dijaga paritasnya oleh
// tests/unit/notification-kinds.test.ts.
export const NOTIFICATION_KINDS = [
  'TASK_ASSIGNED',
  'TASK_COMMENTED',
  'TASK_STATUS_CHANGED',
  'TASK_DUE_SOON',
  'TASK_OVERDUE',
  'TASK_MENTIONED',
  'PROJECT_DUE_SOON',
  'PROJECT_OVERDUE',
  'PROJECT_LOCK_WARNING',
  'PROJECT_LOCKED',
  'PROJECT_DECISION_REQUESTED',
] as const

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]
