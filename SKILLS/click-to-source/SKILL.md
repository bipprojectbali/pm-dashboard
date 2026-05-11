# Skill: Click-to-Source (Dev Inspector)

Fitur yang memungkinkan developer mengklik elemen di browser dan langsung membuka file sumber di editor. Hanya aktif di mode development.

**Shortcut**: `Ctrl+Shift+Cmd+C` (macOS) / `Ctrl+Shift+Alt+C` (Windows/Linux)

---

## Cara Kerja

1. **Vite Plugin** meng-inject `data-inspector-*` attributes ke setiap JSX element saat build time
2. **DevInspector** component menangkap klik di browser, membaca attributes tersebut
3. Browser mengirim `POST /__open-in-editor` ke server
4. Server membuka file di editor via `Bun.spawn`

---

## File yang Perlu Dibuat / Dimodifikasi

### 1. `src/frontend/DevInspector.tsx` — Client-side inspector component

```tsx
import { useCallback, useEffect, useRef, useState } from 'react'

interface CodeInfo {
  relativePath: string
  line: string
  column: string
}

function findCodeInfo(target: HTMLElement): { element: HTMLElement; info: CodeInfo } | null {
  let el: HTMLElement | null = target
  while (el) {
    const relativePath = el.getAttribute('data-inspector-relative-path')
    const line = el.getAttribute('data-inspector-line')
    const column = el.getAttribute('data-inspector-column')
    if (relativePath && line) {
      return { element: el, info: { relativePath, line, column: column ?? '1' } }
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
      if (e.key.toLowerCase() === 'c' && e.ctrlKey && e.shiftKey && (e.metaKey || e.altKey)) {
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
      {/* Blue overlay highlight */}
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
      {/* Tooltip showing file path:line */}
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
```

---

### 2. `src/vite.ts` — Vite plugin `inspectorPlugin()`

Tambahkan plugin ini ke konfigurasi Vite. Plugin harus `enforce: 'pre'` agar jalan sebelum OXC/React transform mengubah source.

```ts
import fs from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'

export function inspectorPlugin(): Plugin {
  const rootDir = process.cwd()
  return {
    name: 'inspector-inject',
    enforce: 'pre',
    transform(code, id) {
      if (!/\.[jt]sx(\?|$)/.test(id) || id.includes('node_modules')) return null
      if (!code.includes('<')) return null

      const cleanId = id.replace(/\?.*$/, '')
      const relativePath = path.relative(rootDir, cleanId)

      // Baca file asli dari disk untuk line number akurat
      // (source yang diterima plugin bisa sudah di-transform oleh plugin lain)
      let originalLines: string[] | null = null
      try {
        originalLines = fs.readFileSync(cleanId, 'utf-8').split('\n')
      } catch {}

      let modified = false
      let lastOrigIdx = 0
      const lines = code.split('\n')
      const result: string[] = []

      for (let i = 0; i < lines.length; i++) {
        let line = lines[i]
        // Match JSX tags: <Component atau <html-tag (bukan closing tags)
        const jsxPattern =
          /(<(?:[A-Z][a-zA-Z0-9]*(?:\.[a-zA-Z][a-zA-Z0-9]*)*|[a-z][a-zA-Z0-9-]*(?:\.[a-zA-Z][a-zA-Z0-9]*)*))\b/g
        let match: RegExpExecArray | null = jsxPattern.exec(line)

        while (match !== null) {
          // Skip jika char sebelumnya adalah bagian identifier (bukan JSX)
          const charBefore = match.index > 0 ? line[match.index - 1] : ''
          if (/[a-zA-Z0-9_$.]/.test(charBefore)) {
            match = jsxPattern.exec(line)
            continue
          }

          let actualLine = i + 1
          if (originalLines) {
            const afterTag = line.slice(match.index)
            const snippet = afterTag
              .split('>')[0]
              .replace(/\s*data-inspector-[^"]*"[^"]*"/g, '')
              .trim()
            const tagName = match[1]
            let found = false

            // 4 strategi pencarian line number di file original:
            // 1) Forward search dengan full snippet
            for (let j = lastOrigIdx; j < originalLines.length; j++) {
              if (originalLines[j].includes(snippet)) {
                actualLine = j + 1; lastOrigIdx = j + 1; found = true; break
              }
            }
            // 2) Forward search hanya tag name (handle collapsed multi-line)
            if (!found) {
              for (let j = lastOrigIdx; j < originalLines.length; j++) {
                if (originalLines[j].includes(tagName)) {
                  actualLine = j + 1; lastOrigIdx = j + 1; found = true; break
                }
              }
            }
            // 3) Reset ke awal dengan full snippet
            if (!found) {
              for (let j = 0; j < originalLines.length; j++) {
                if (originalLines[j].includes(snippet)) {
                  actualLine = j + 1; lastOrigIdx = j + 1; found = true; break
                }
              }
            }
            // 4) Reset ke awal dengan tag name (last resort)
            if (!found) {
              for (let j = 0; j < originalLines.length; j++) {
                if (originalLines[j].includes(tagName) && !originalLines[j].trim().startsWith('</')) {
                  actualLine = j + 1; lastOrigIdx = j + 1; break
                }
              }
            }
          }

          const col = match.index + 1
          const attr = ` data-inspector-line="${actualLine}" data-inspector-column="${col}" data-inspector-relative-path="${relativePath}"`
          const insertPos = match.index + match[0].length
          line = line.slice(0, insertPos) + attr + line.slice(insertPos)
          modified = true
          jsxPattern.lastIndex += attr.length
          match = jsxPattern.exec(line)
        }
        result.push(line)
      }

      if (!modified) return null
      return result.join('\n')
    },
  }
}
```

**Daftarkan di Vite config:**

```ts
// vite.config.ts
import { inspectorPlugin } from './src/vite'

export default defineConfig({
  plugins: [
    inspectorPlugin(), // harus sebelum react()
    react(),
  ],
})
```

---

### 3. Server — Endpoint `POST /__open-in-editor`

Tambahkan handler ini di server entry (hanya dev mode). Contoh untuk **Elysia + Bun**:

```ts
// src/index.tsx (atau server entry)
import { env } from './lib/env'

// Di dalam middleware/onRequest, sebelum route matching:
if (!isProduction && pathname === '/__open-in-editor' && request.method === 'POST') {
  const { relativePath, lineNumber, columnNumber } = await request.json() as {
    relativePath: string
    lineNumber: string
    columnNumber: string
  }
  const file = `${process.cwd()}/${relativePath}`
  const editor = env.REACT_EDITOR  // dari .env, e.g. "cursor", "code", "zed", "subl"
  const loc = `${file}:${lineNumber}:${columnNumber}`

  // zed & subl: pakai `editor file:line:col`
  // code, cursor: pakai `editor --goto file:line:col`
  const noGotoEditors = ['subl', 'zed']
  const args = noGotoEditors.includes(editor) ? [loc] : ['--goto', loc]

  const editorPath = Bun.which(editor)
  if (editorPath) Bun.spawn([editor, ...args], { stdio: ['ignore', 'ignore', 'ignore'] })
  return new Response('ok')
}
```

Untuk **Express / Fastify**, equivalent-nya:

```ts
app.post('/__open-in-editor', async (req, res) => {
  const { relativePath, lineNumber, columnNumber } = req.body
  const file = `${process.cwd()}/${relativePath}`
  const editor = process.env.REACT_EDITOR ?? 'code'
  const loc = `${file}:${lineNumber}:${columnNumber}`
  const noGotoEditors = ['subl', 'zed']
  const args = noGotoEditors.includes(editor) ? [loc] : ['--goto', loc]
  const { spawn } = await import('node:child_process')
  spawn(editor, args, { stdio: 'ignore', detached: true })
  res.send('ok')
})
```

---

### 4. `src/frontend.tsx` — Wrap app dengan DevInspector (dev only)

```tsx
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './frontend/App'

// Tree-shaken di production build
const InspectorWrapper = import.meta.env?.DEV
  ? (await import('./frontend/DevInspector')).DevInspector
  : ({ children }: { children: ReactNode }) => <>{children}</>

const elem = document.getElementById('root')!
const app = (
  <InspectorWrapper>
    <App />
  </InspectorWrapper>
)

createRoot(elem).render(app)
```

---

## Environment Variable

```env
# .env
REACT_EDITOR=cursor   # atau: code, zed, subl, webstorm
```

Editor yang didukung:
| Value | Binary | Format |
|-------|--------|--------|
| `cursor` | `cursor` | `--goto file:line:col` |
| `code` | `code` | `--goto file:line:col` |
| `zed` | `zed` | `file:line:col` |
| `subl` | `subl` | `file:line:col` |
| `webstorm` | `webstorm` | `--goto file:line:col` |

---

## Dependency

Tidak ada dependency tambahan — semua menggunakan API yang sudah ada:
- **Bun**: `Bun.which()`, `Bun.spawn()` (gunakan `child_process.spawn` untuk Node.js)
- **Vite**: `Plugin` type dari `vite`
- **React**: `useCallback`, `useEffect`, `useRef`, `useState`
- `node:fs`, `node:path` — Node/Bun built-in

---

## Catatan Penting

### Kenapa baca file dari disk di plugin?

Plugin Vite menerima code yang mungkin sudah di-transform oleh plugin lain (OXC, TanStack Router). Line numbers di transformed code tidak akurat. Plugin membaca file **asli dari disk** (`fs.readFileSync`) dan melakukan cross-reference untuk mendapatkan line number yang benar.

### `enforce: 'pre'`

Wajib agar plugin jalan **sebelum** React/OXC transform mengubah JSX. Tanpa ini, attributes tidak ter-inject dengan benar.

### `dedupeRefreshPlugin` (opsional)

Jika menggunakan `@vitejs/plugin-react` v6 + Vite 8 di middleware mode, ada bug duplikat React Refresh injection. Tambahkan plugin ini setelah `react()`:

```ts
function dedupeRefreshPlugin(): Plugin {
  return {
    name: 'dedupe-react-refresh',
    enforce: 'post',
    transform(code, id) {
      if (!/\.[jt]sx(\?|$)/.test(id) || id.includes('node_modules')) return null
      const marker = 'import * as RefreshRuntime from "/@react-refresh"'
      const firstIdx = code.indexOf(marker)
      if (firstIdx === -1) return null
      const secondIdx = code.indexOf(marker, firstIdx + marker.length)
      if (secondIdx === -1) return null
      const sourcemapIdx = code.indexOf('\n//# sourceMappingURL=', secondIdx)
      const endIdx = sourcemapIdx !== -1 ? sourcemapIdx : code.length
      return { code: code.slice(0, secondIdx) + code.slice(endIdx), map: null }
    },
  }
}
```

### Production Safety

- `DevInspector` di-import secara conditional (`import.meta.env?.DEV`) → tree-shaken di production build
- Endpoint `/__open-in-editor` hanya aktif saat `!isProduction`
- Vite plugin mengubah code hanya saat dev server berjalan (tidak mempengaruhi production build)

---

## Checklist Implementasi

- [ ] Buat `src/frontend/DevInspector.tsx`
- [ ] Tambahkan `inspectorPlugin()` di Vite config (sebelum `react()`)
- [ ] Tambahkan endpoint `POST /__open-in-editor` di server entry (dev only)
- [ ] Wrap root app dengan `InspectorWrapper` di `src/frontend.tsx`
- [ ] Set `REACT_EDITOR` di `.env`
- [ ] Test: tekan `Ctrl+Shift+Cmd+C`, hover element, klik → editor membuka file

---

## Tanda Implementasi Berhasil

Gunakan daftar ini sebagai acuan verifikasi. Implementasi dianggap **berhasil dan dapat dipercaya** jika semua tanda di bawah terpenuhi.

### 1. Vite Plugin — Build Time

Buka DevTools → Elements, inspect salah satu JSX element (misal `<button>` atau `<div>`). Harus ada 3 attributes:

```html
<div
  data-inspector-line="42"
  data-inspector-column="5"
  data-inspector-relative-path="src/frontend/components/Foo.tsx"
>
```

Jika attributes **tidak muncul** → plugin belum `enforce: 'pre'` atau belum terdaftar di Vite config.

### 2. Hotkey — Toggle Mode

Tekan `Ctrl+Shift+Cmd+C` (macOS) atau `Ctrl+Shift+Alt+C` (Windows/Linux):

- Cursor browser berubah menjadi **crosshair** `⌖` → inspector aktif
- Tekan lagi atau tekan `Escape` → cursor kembali normal → inspector nonaktif

### 3. Hover — Overlay & Tooltip

Saat inspector aktif, arahkan mouse ke elemen mana saja:

- Muncul **kotak biru transparan** mengelilingi batas elemen tersebut
- Muncul **tooltip gelap** di atas elemen berisi teks format: `src/frontend/components/Foo.tsx:42`
- Path yang ditampilkan harus **relatif dari root project** (bukan path absolut)

### 4. Klik — Buka Editor

Klik elemen saat inspector aktif:

- Inspector langsung **nonaktif** (cursor kembali normal)
- Editor yang dikonfigurasi di `REACT_EDITOR` **membuka file** dan **melompat ke baris yang tepat**
- Path di clipboard terisi otomatis: `src/frontend/components/Foo.tsx:42:5`
- Network tab DevTools: muncul request `POST /__open-in-editor` dengan status `200`

### 5. Akurasi Line Number

Klik pada sebuah component (misal `<Button>` di baris 87 file asli):

- Editor harus membuka file dan cursor berada di **baris 87** — bukan baris hasil transform
- Jika line number meleset jauh (>5 baris) → plugin membaca transformed code, bukan file asli; pastikan `fs.readFileSync(cleanId)` menggunakan `cleanId` tanpa query string (`id.replace(/\?.*$/, '')`)

### 6. Production — Tidak Aktif

Build production (`bun run build`) lalu jalankan:

- Shortcut `Ctrl+Shift+Cmd+C` **tidak bereaksi** (tidak ada crosshair, tidak ada overlay)
- Inspect elemen di DevTools: **tidak ada** `data-inspector-*` attributes
- Network tab: **tidak ada** request ke `/__open-in-editor`
- Bundle size tidak membengkak karena `DevInspector.tsx` ter-tree-shake

### 7. Tidak Merusak Klik Normal

Saat inspector **nonaktif** (default):

- Semua event klik berjalan normal (link, button, form submit tidak terblokir)
- `e.preventDefault()` dan `e.stopPropagation()` hanya aktif saat inspector sedang on

---

### Ringkasan Cepat (Quick Sanity Check)

| Tes | Yang Diharapkan |
|-----|----------------|
| Inspect element di DevTools | Ada `data-inspector-*` pada JSX elements |
| Tekan shortcut | Cursor jadi crosshair |
| Hover element | Kotak biru + tooltip `path:line` muncul |
| Klik element | Editor buka di baris tepat, request `/__open-in-editor` 200 |
| Build production | Tidak ada attributes, shortcut tidak aktif |
| Klik normal (inspector off) | Event tidak terblokir |
