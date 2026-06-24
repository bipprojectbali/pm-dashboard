export const WINDOW_OPTIONS = [
  { label: '7 hari', value: '7' },
  { label: '30 hari', value: '30' },
  { label: '90 hari', value: '90' },
]

export const AP_PROJ_COLOR: Record<string, string> = {
  ACTIVE: 'blue',
  ON_HOLD: 'yellow',
  DRAFT: 'gray',
  COMPLETED: 'green',
  CANCELLED: 'dark',
}

export const AP_PROJ_LABEL: Record<string, string> = {
  ACTIVE: 'Active',
  ON_HOLD: 'On Hold',
  DRAFT: 'Draft',
  COMPLETED: 'Done',
  CANCELLED: 'Cancelled',
}

export function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}
