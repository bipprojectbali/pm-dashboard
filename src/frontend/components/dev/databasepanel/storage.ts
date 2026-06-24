import type { Node } from '@xyflow/react'

export const STORAGE_KEY = 'dev:schema:positions'
export const VIEWPORT_KEY = 'dev:schema:viewport'

export function savePositions(nodes: Node[]) {
  const positions: Record<string, { x: number; y: number }> = {}
  for (const n of nodes) {
    positions[n.id] = n.position
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(positions))
}

export function loadPositions(): Record<string, { x: number; y: number }> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveViewport(viewport: { x: number; y: number; zoom: number }) {
  localStorage.setItem(VIEWPORT_KEY, JSON.stringify(viewport))
}

export function loadViewport(): { x: number; y: number; zoom: number } | null {
  try {
    const raw = localStorage.getItem(VIEWPORT_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}
