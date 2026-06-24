import type { IconType } from 'react-icons'

export type UserRole = 'USER' | 'QC' | 'ADMIN' | 'SUPER_ADMIN'
export type LandingUser = { role: UserRole; name: string } | null | undefined
import { SiBun, SiPostgresql, SiPrisma, SiRedis, SiTypescript, SiVite } from 'react-icons/si'
import {
  TbActivity,
  TbBolt,
  TbBrandReact,
  TbChecklist,
  TbCode,
  TbDeviceDesktopAnalytics,
  TbFeather,
  TbLayoutDashboard,
  TbShieldLock,
  TbUsers,
} from 'react-icons/tb'

export interface Feature {
  icon: IconType
  color: string
  badge: string
  title: string
  description: string
}

export interface TechItem {
  icon: IconType
  label: string
  color: string
}

export const features: Feature[] = [
  {
    icon: TbLayoutDashboard,
    color: 'blue',
    badge: 'Core',
    title: 'Project Manager',
    description: 'Rencanakan project, kelola anggota tim, set milestone, dan pantau progress dengan role-based access (Owner, PM, Member, Viewer).',
  },
  {
    icon: TbChecklist,
    color: 'violet',
    badge: 'Workflow',
    title: 'Task Workflow',
    description: 'Task, bug, dan QC item dengan prioritas, dependensi, checklist, tag, komentar, dan riwayat status lengkap.',
  },
  {
    icon: TbDeviceDesktopAnalytics,
    color: 'cyan',
    badge: 'DevTools',
    title: 'Live Dev Console',
    description: 'React Flow visualisasi schema, routes, env vars, dependencies, sessions, dan live request stream realtime.',
  },
  {
    icon: TbShieldLock,
    color: 'red',
    badge: 'Auth',
    title: 'Auth & RBAC',
    description: 'Session cookie, Google OAuth, dan 4 roles (USER · QC · ADMIN · SUPER_ADMIN) dengan route-level guards.',
  },
]

export const stack: TechItem[] = [
  { icon: SiBun, label: 'Bun', color: '#f9b94c' },
  { icon: TbFeather, label: 'Elysia', color: '#a855f7' },
  { icon: TbBrandReact, label: 'React 19', color: '#61dafb' },
  { icon: SiVite, label: 'Vite 8', color: '#bd34fe' },
  { icon: SiTypescript, label: 'TypeScript', color: '#3178c6' },
  { icon: SiPrisma, label: 'Prisma', color: '#5a67d8' },
  { icon: SiPostgresql, label: 'PostgreSQL', color: '#336791' },
  { icon: SiRedis, label: 'Redis', color: '#dc382d' },
]

export const stats = [
  { value: '4', label: 'Roles', icon: TbUsers },
  { value: '50+', label: 'API Endpoints', icon: TbBolt },
  { value: '10', label: 'Visualizations', icon: TbCode },
  { value: 'WS', label: 'Realtime Sync', icon: TbActivity },
]
