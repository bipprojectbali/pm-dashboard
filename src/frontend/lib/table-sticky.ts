import type { CSSProperties } from 'react'

export function stickyFirstHeader(minWidth = 240): CSSProperties {
  return {
    position: 'sticky',
    left: 0,
    zIndex: 3,
    background: 'var(--mantine-color-body)',
    minWidth,
    width: minWidth,
    boxShadow: '2px 0 4px -2px rgba(0,0,0,0.08)',
  }
}

export function stickyFirstCell(minWidth = 240): CSSProperties {
  return {
    position: 'sticky',
    left: 0,
    zIndex: 1,
    background: 'var(--mantine-color-body)',
    minWidth,
    width: minWidth,
    boxShadow: '2px 0 4px -2px rgba(0,0,0,0.08)',
  }
}
