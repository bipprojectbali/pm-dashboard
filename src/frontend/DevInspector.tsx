import { useCallback, useEffect, useRef, useState } from 'react'

interface CodeInfo {
  relativePath: string
  line: string
  column: string
}

/** Walk up DOM tree, cari elemen dengan data-inspector-* attributes */
function findCodeInfo(target: HTMLElement): { element: HTMLElement; info: CodeInfo } | null {
  let el: HTMLElement | null = target
  while (el) {
    const relativePath = el.getAttribute('data-inspector-relative-path')
    const line = el.getAttribute('data-inspector-line')
    const column = el.getAttribute('data-inspector-column')
    if (relativePath && line) {
      return {
        element: el,
        info: { relativePath, line, column: column ?? '1' },
      }
    }
    el = el.parentElement
  }
  return null
}

function openInEditor(info: CodeInfo) {
  fetch('/__open-in-editor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      relativePath: info.relativePath,
      lineNumber: info.line,
      columnNumber: info.column,
    }),
  })
}

export function DevInspector({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState(false)
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const tooltipRef = useRef<HTMLDivElement | null>(null)
  const lastInfoRef = useRef<CodeInfo | null>(null)

  const updateOverlay = useCallback((target: HTMLElement | null) => {
    const ov = overlayRef.current
    const tt = tooltipRef.current
    if (!ov || !tt) return

    if (!target) {
      ov.style.display = 'none'
      tt.style.display = 'none'
      lastInfoRef.current = null
      return
    }

    const result = findCodeInfo(target)
    if (!result) {
      ov.style.display = 'none'
      tt.style.display = 'none'
      lastInfoRef.current = null
      return
    }

    lastInfoRef.current = result.info
    const rect = result.element.getBoundingClientRect()
    ov.style.display = 'block'
    ov.style.top = `${rect.top + window.scrollY}px`
    ov.style.left = `${rect.left + window.scrollX}px`
    ov.style.width = `${rect.width}px`
    ov.style.height = `${rect.height}px`

    tt.style.display = 'block'
    tt.textContent = `${result.info.relativePath}:${result.info.line}`
    const ttTop = rect.top + window.scrollY - 24
    tt.style.top = `${ttTop > 0 ? ttTop : rect.bottom + window.scrollY + 4}px`
    tt.style.left = `${rect.left + window.scrollX}px`
  }, [])

  useEffect(() => {
    if (!active) return
    const onMouseOver = (e: MouseEvent) => updateOverlay(e.target as HTMLElement)
    const onClick = (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const result = findCodeInfo(e.target as HTMLElement)
      const info = result?.info ?? lastInfoRef.current
      if (info) {
        const loc = `${info.relativePath}:${info.line}:${info.column}`
        navigator.clipboard.writeText(loc).catch(() => {})
        openInEditor(info)
      }
      setActive(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActive(false)
    }
    document.addEventListener('mouseover', onMouseOver, true)
    document.addEventListener('click', onClick, true)
    document.addEventListener('keydown', onKeyDown)
    document.body.style.cursor = 'crosshair'
    return () => {
      document.removeEventListener('mouseover', onMouseOver, true)
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.cursor = ''
      if (overlayRef.current) overlayRef.current.style.display = 'none'
      if (tooltipRef.current) tooltipRef.current.style.display = 'none'
    }
  }, [active, updateOverlay])

  // Hotkey: Ctrl+Shift+Cmd+C (macOS) / Ctrl+Shift+Alt+C (Windows/Linux)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key?.toLowerCase() === 'c' && e.ctrlKey && e.shiftKey && (e.metaKey || e.altKey)) {
        e.preventDefault()
        setActive((prev) => !prev)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <>
      {children}
      <div
        ref={overlayRef}
        style={{
          display: 'none',
          position: 'absolute',
          pointerEvents: 'none',
          border: '2px solid #3b82f6',
          backgroundColor: 'rgba(59,130,246,0.1)',
          zIndex: 99999,
          transition: 'all 0.05s ease',
        }}
      />
      <div
        ref={tooltipRef}
        style={{
          display: 'none',
          position: 'absolute',
          pointerEvents: 'none',
          backgroundColor: '#1e293b',
          color: '#e2e8f0',
          fontSize: '12px',
          fontFamily: 'monospace',
          padding: '2px 6px',
          borderRadius: '3px',
          zIndex: 100000,
          whiteSpace: 'nowrap',
        }}
      />
    </>
  )
}
