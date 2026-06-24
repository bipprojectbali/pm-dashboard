import {
  TbCalendarEvent,
  TbLayoutDashboard,
  TbListCheck,
  TbTarget,
  TbUsers,
} from 'react-icons/tb'
import type { NavItem, TabKey } from './types'

export function buildNavItems(counts: { events: number; tasks: number; projects: number; overdue: number }): NavItem[] {
  return [
    {
      label: 'Ringkasan',
      description: 'KPI, overdue, prioritas',
      icon: TbLayoutDashboard,
      key: 'overview',
      badge: counts.overdue > 0 ? String(counts.overdue) : undefined,
      badgeColor: counts.overdue > 0 ? 'red' : undefined,
    },
    {
      label: 'Proyek',
      description: 'Kelola semua proyek',
      icon: TbTarget,
      key: 'projects',
      badge: counts.projects > 0 ? String(counts.projects) : undefined,
      badgeColor: 'blue',
    },
    {
      label: 'Task',
      description: 'Tugas kamu & tim',
      icon: TbListCheck,
      key: 'tasks',
      badge: counts.tasks > 0 ? String(counts.tasks) : undefined,
      badgeColor: counts.overdue > 0 ? 'orange' : 'blue',
    },
    { label: 'Tim', description: 'Anggota & beban kerja', icon: TbUsers, key: 'team' },
    {
      label: 'Events',
      description: 'Jadwal & pengingat tim',
      icon: TbCalendarEvent,
      key: 'events' as TabKey,
      badge: counts.events > 0 ? String(counts.events) : undefined,
      badgeColor: 'orange',
    },
  ]
}

export const TAB_META: Record<TabKey, { label: string; description: string }> = {
  overview: {
    label: 'Ringkasan',
    description: 'KPI task kamu, overdue, deadline minggu ini, dan notifikasi terbaru.',
  },
  projects: {
    label: 'Proyek',
    description: 'Portfolio proyek yang kamu miliki atau ikuti. Buat, pantau, kelola deadline.',
  },
  tasks: {
    label: 'Task',
    description: 'Semua task di proyek kamu. Filter by assignee, status, tag, atau prioritas.',
  },
  team: {
    label: 'Tim',
    description: 'Anggota proyek dan beban kerja per user.',
  },
  events: {
    label: 'Events',
    description: 'Jadwal dan pengingat tim bersama — meeting, review, atau event penting lainnya.',
  },
}
