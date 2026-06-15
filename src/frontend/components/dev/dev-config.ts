import {
  TbBrandGithub,
  TbBrandTelegram,
  TbCloudDownload,
  TbDatabase,
  TbFileAlert,
  TbLayoutDashboard,
  TbMessageChatbot,
  TbRobot,
  TbServer,
  TbShieldCheck,
  TbSitemap,
  TbUserSearch,
  TbUsers,
} from 'react-icons/tb'

export const validTabs = [
  'overview',
  'users',
  'app-logs',
  'user-logs',
  'database',
  'project',
  'file-health',
  'sync',
  'channel',
  'ai',
  'ext-github',
  'ext-chat',
  'permissions',
] as const

export type TabKey = (typeof validTabs)[number]

export const TAB_META: Record<TabKey, { label: string; description: string }> = {
  overview: {
    label: 'Ringkasan',
    description: 'KPI cepat: total user, online, admin, blocked.',
  },
  users: {
    label: 'Pengguna',
    description: 'Manajemen user sistem — role, blok/unblok.',
  },
  'app-logs': {
    label: 'Log Aplikasi',
    description: 'Redis ring buffer log aplikasi (500 entry). Polling 5 detik.',
  },
  'user-logs': {
    label: 'Log Audit',
    description: 'Jejak aktivitas user: login, logout, perubahan role, blok.',
  },
  database: {
    label: 'Database',
    description: 'ER diagram Prisma schema — posisi node auto-save ke localStorage.',
  },
  project: {
    label: 'Struktur Proyek',
    description: 'Routes, file graph, env vars, test coverage, dependencies, migrasi.',
  },
  'file-health': {
    label: 'File Health',
    description: 'Ukuran setiap file vs batas FILE_HEALTH.md. Over limit ditampilkan merah.',
  },
  sync: {
    label: 'Data Sync',
    description: 'Pull data dari remote (STG/prod) ke local untuk dev dengan data mendekati real.',
  },
  channel: {
    label: 'Saluran',
    description: 'Konfigurasi Telegram bot untuk laporan harian otomatis.',
  },
  ai: {
    label: 'AI & Laporan',
    description: 'Konfigurasi Claude AI, model, jadwal kirim, dan preview laporan.',
  },
  'ext-github': {
    label: 'GitHub Integration',
    description: 'Toggle extension: webhook /webhooks/github + card aktivitas + dokumen RAG github_project.',
  },
  'ext-chat': {
    label: 'Chat AI',
    description: 'Toggle extension: tab Chat AI di /admin, sync chat_document, embedding & Anthropic call.',
  },
  permissions: {
    label: 'Aturan Izin',
    description: 'Konfigurasi runtime role permission — project create/delete, task write/delete. Cache 60s.',
  },
}

export type DevNavItem = {
  label: string
  icon: typeof TbLayoutDashboard
  key: TabKey
}

export type DevNavGroup = { label: string; items: DevNavItem[] }

export const navGroups: DevNavGroup[] = [
  {
    label: 'Pantau',
    items: [
      { label: 'Ringkasan', icon: TbLayoutDashboard, key: 'overview' },
      { label: 'Pengguna', icon: TbUsers, key: 'users' },
    ],
  },
  {
    label: 'Log',
    items: [
      { label: 'Log Aplikasi', icon: TbServer, key: 'app-logs' },
      { label: 'Log Audit', icon: TbUserSearch, key: 'user-logs' },
    ],
  },
  {
    label: 'Struktur',
    items: [
      { label: 'Database', icon: TbDatabase, key: 'database' },
      { label: 'Proyek', icon: TbSitemap, key: 'project' },
      { label: 'File Health', icon: TbFileAlert, key: 'file-health' },
      { label: 'Data Sync', icon: TbCloudDownload, key: 'sync' },
    ],
  },
  {
    label: 'Otomasi',
    items: [
      { label: 'Saluran', icon: TbBrandTelegram, key: 'channel' },
      { label: 'AI & Laporan', icon: TbRobot, key: 'ai' },
    ],
  },
  {
    label: 'Extensions',
    items: [
      { label: 'GitHub Integration', icon: TbBrandGithub, key: 'ext-github' },
      { label: 'Chat AI', icon: TbMessageChatbot, key: 'ext-chat' },
    ],
  },
  {
    label: 'Keamanan',
    items: [{ label: 'Aturan Izin', icon: TbShieldCheck, key: 'permissions' }],
  },
]
