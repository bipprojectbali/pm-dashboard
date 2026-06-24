import { Elysia } from 'elysia'
import { prisma } from '../../lib/db'
import { extractSessionToken } from '../../lib/route-helpers'

export function adminDevInspectRoutes() {
  return (
    new Elysia()

      .get('/api/admin/file-health', async ({ request, set }) => {
        const cookie = request.headers.get('cookie') ?? ''
        const token = extractSessionToken(cookie)
        if (!token) {
          set.status = 401
          return { error: 'Unauthorized' }
        }
        const session = await prisma.session.findUnique({
          where: { token },
          include: { user: { select: { role: true } } },
        })
        if (!session || session.expiresAt < new Date() || session.user.role !== 'SUPER_ADMIN') {
          set.status = 403
          return { error: 'Forbidden' }
        }

        const fs = await import('node:fs')
        const path = await import('node:path')
        const root = process.cwd()

        type FileType = 'route-handler' | 'utility' | 'service' | 'test' | 'component' | 'frontend-route' | 'other'
        type FileStatus = 'ok' | 'warning' | 'over'

        function getFileMeta(rel: string): { skip: boolean; type?: FileType; limitLines?: number; limitChars?: number } {
          if (
            rel.includes('/generated/') ||
            rel.endsWith('.generated.ts') ||
            rel.startsWith('prisma/migrations/') ||
            rel === 'prisma/seed.ts' ||
            rel.includes('/__fixtures__/') ||
            rel.includes('/__mocks__/')
          )
            return { skip: true }
          if (/src\/routes\/.*\.route\.ts$/.test(rel))
            return { skip: false, type: 'route-handler', limitLines: 150, limitChars: 6000 }
          if (/tests\/.*\.test\.(ts|tsx)$/.test(rel))
            return { skip: false, type: 'test', limitLines: 400, limitChars: 16000 }
          if (rel.startsWith('src/lib/')) return { skip: false, type: 'utility', limitLines: 200, limitChars: 8000 }
          if (rel.startsWith('scripts/mcp/tools/'))
            return { skip: false, type: 'service', limitLines: 300, limitChars: 12000 }
          if (rel.startsWith('src/frontend/components/'))
            return { skip: false, type: 'component', limitLines: 300, limitChars: 12000 }
          if (rel.startsWith('src/frontend/routes/'))
            return { skip: false, type: 'frontend-route', limitLines: 500, limitChars: 20000 }
          return { skip: false, type: 'other', limitLines: 500, limitChars: 20000 }
        }

        interface FileHealth {
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

        const results: FileHealth[] = []
        const scanDirs = ['src', 'scripts', 'tests']
        const skipDirs = new Set(['node_modules', 'dist', 'generated', '.git', '.next', 'coverage'])
        const exts = new Set(['.ts', '.tsx'])

        function scan(dir: string) {
          let entries: string[] = []
          try {
            entries = fs.readdirSync(dir)
          } catch {
            return
          }
          for (const entry of entries) {
            if (skipDirs.has(entry)) continue
            const full = path.join(dir, entry)
            const stat = fs.statSync(full)
            if (stat.isDirectory()) {
              scan(full)
              continue
            }
            const ext = path.extname(entry)
            if (!exts.has(ext)) continue
            const rel = path.relative(root, full).replace(/\\/g, '/')
            const meta = getFileMeta(rel)
            if (meta.skip) continue
            const content = fs.readFileSync(full, 'utf8')
            const lines = content.split('\n').length
            const chars = content.length
            const pctLines = Math.round((lines / meta.limitLines!) * 100)
            const pctChars = Math.round((chars / meta.limitChars!) * 100)
            const pct = Math.max(pctLines, pctChars)
            const status: FileStatus = pct >= 100 ? 'over' : pct >= 70 ? 'warning' : 'ok'
            results.push({
              path: rel,
              type: meta.type!,
              lines,
              chars,
              limitLines: meta.limitLines!,
              limitChars: meta.limitChars!,
              pctLines,
              pctChars,
              pct,
              status,
            })
          }
        }

        for (const d of scanDirs) scan(path.join(root, d))
        results.sort((a, b) => b.pct - a.pct)

        const summary = {
          total: results.length,
          ok: results.filter((f) => f.status === 'ok').length,
          warning: results.filter((f) => f.status === 'warning').length,
          over: results.filter((f) => f.status === 'over').length,
        }

        return { summary, files: results }
      })
  )
}
