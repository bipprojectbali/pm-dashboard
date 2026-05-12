import fs from 'node:fs'
import path from 'node:path'
import { TanStackRouterVite } from '@tanstack/router-vite-plugin'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { createServer as createViteServer } from 'vite'

/**
 * Custom Vite plugin: inject data-inspector-* attributes ke JSX via regex.
 * enforce: "pre" → jalan SEBELUM OXC transform JSX.
 *
 * Karena plugin lain (OXC, TanStack) bisa mengubah source sebelum kita
 * (collapse lines, resolve imports), kita baca file ASLI dari disk untuk
 * line number yang akurat, lalu cross-reference dengan code yang diterima.
 */
function inspectorPlugin(): Plugin {
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
        const jsxPattern =
          /(<(?:[A-Z][a-zA-Z0-9]*(?:\.[a-zA-Z][a-zA-Z0-9]*)*|[a-z][a-zA-Z0-9-]*(?:\.[a-zA-Z][a-zA-Z0-9]*)*))\b/g
        let match: RegExpExecArray | null = jsxPattern.exec(line)

        while (match !== null) {
          const charBefore = match.index > 0 ? line[match.index - 1] : ''
          if (/[a-zA-Z0-9_$.]/.test(charBefore)) {
            match = jsxPattern.exec(line)
            continue
          }

          // Cari line number asli di file original
          let actualLine = i + 1
          if (originalLines) {
            const afterTag = line.slice(match.index)
            // Snippet: tag + atribut sampai '>' pertama, tanpa injected attrs
            const snippet = afterTag
              .split('>')[0]
              .replace(/\s*data-inspector-[^"]*"[^"]*"/g, '')
              .trim()
            // Tag name saja sebagai fallback (e.g. "<Button")
            const tagName = match[1]

            let found = false

            // 1) Forward search dengan full snippet
            for (let j = lastOrigIdx; j < originalLines.length; j++) {
              if (originalLines[j].includes(snippet)) {
                actualLine = j + 1
                lastOrigIdx = j + 1
                found = true
                break
              }
            }

            // 2) Fallback: forward search hanya tag name (handle multi-line collapsed)
            //    Penting untuk <Button\n  attr="..."\n> yang di-collapse jadi 1 baris
            if (!found) {
              for (let j = lastOrigIdx; j < originalLines.length; j++) {
                if (originalLines[j].includes(tagName)) {
                  actualLine = j + 1
                  lastOrigIdx = j + 1
                  found = true
                  break
                }
              }
            }

            // 3) Last resort: search dari awal dengan full snippet
            if (!found) {
              for (let j = 0; j < originalLines.length; j++) {
                if (originalLines[j].includes(snippet)) {
                  actualLine = j + 1
                  lastOrigIdx = j + 1
                  found = true
                  break
                }
              }
            }

            // 4) Last resort: search dari awal dengan tag name
            if (!found) {
              for (let j = 0; j < originalLines.length; j++) {
                if (originalLines[j].includes(tagName) && !originalLines[j].trim().startsWith('</')) {
                  actualLine = j + 1
                  lastOrigIdx = j + 1
                  break
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

/**
 * Workaround: @vitejs/plugin-react v6 + Vite 8 middlewareMode
 * inject React Refresh HMR footer 2x → "Identifier RefreshRuntime already declared".
 * Plugin ini hapus duplikat setelah semua transform selesai.
 */
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

export async function createVite() {
  return createViteServer({
    root: process.cwd(),
    resolve: {
      alias: {
        '@': path.resolve(process.cwd(), './src'),
      },
    },
    plugins: [
      TanStackRouterVite({
        routesDirectory: './src/frontend/routes',
        generatedRouteTree: './src/frontend/routeTree.gen.ts',
        routeFileIgnorePrefix: '-',
        quoteStyle: 'single',
      }),
      inspectorPlugin(),
      react(),
      dedupeRefreshPlugin(),
    ],
    server: {
      middlewareMode: true,
      hmr: { port: Number(process.env.HMR_PORT) || 24678 },
      allowedHosts: true,
    },
    appType: 'custom',
    optimizeDeps: {
      include: ['react', 'react-dom'],
    },
  })
}
