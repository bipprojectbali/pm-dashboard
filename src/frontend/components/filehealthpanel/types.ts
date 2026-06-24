import { TbAlertTriangle, TbCircleCheck, TbFileAlert } from 'react-icons/tb'

export type FileType = 'route-handler' | 'utility' | 'service' | 'test' | 'component' | 'frontend-route' | 'other'
export type FileStatus = 'ok' | 'warning' | 'over'

export interface FileHealth {
  path: string
  type: FileType
  lines: number
  chars: number
  limitLines: number
  limitChars: number
  pctLines: number
  pctChars: number
  pct: number
  status: FileStatus
}

export interface Summary {
  total: number
  ok: number
  warning: number
  over: number
}

export const TYPE_LABEL: Record<FileType, string> = {
  'route-handler': 'Route',
  utility: 'Utility',
  service: 'Service',
  test: 'Test',
  component: 'Component',
  'frontend-route': 'FE Route',
  other: 'Other',
}

export const TYPE_COLOR: Record<FileType, string> = {
  'route-handler': 'blue',
  utility: 'teal',
  service: 'grape',
  test: 'gray',
  component: 'violet',
  'frontend-route': 'cyan',
  other: 'dark',
}

export const STATUS_COLOR: Record<FileStatus, string> = { ok: 'teal', warning: 'yellow', over: 'red' }

export const STATUS_ICON: Record<FileStatus, typeof TbCircleCheck> = {
  ok: TbCircleCheck,
  warning: TbAlertTriangle,
  over: TbFileAlert,
}

export const PAGE_SIZE = 25
