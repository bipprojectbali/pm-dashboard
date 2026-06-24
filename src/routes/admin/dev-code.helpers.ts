export interface FileInfo {
  path: string
  category: string
  lines: number
  exports: string[]
  imports: { from: string; names: string[] }[]
}

export interface DirInfo {
  path: string
  category: string
  fileCount: number
}

export function categorize(filePath: string): string {
  if (filePath.startsWith('src/frontend/routes/')) return 'route'
  if (filePath.startsWith('src/frontend/hooks/')) return 'hook'
  if (filePath.startsWith('src/frontend/components/')) return 'component'
  if (filePath.startsWith('src/frontend')) return 'frontend'
  if (filePath.startsWith('src/lib/')) return 'lib'
  if (filePath.startsWith('prisma/')) return 'prisma'
  if (filePath.startsWith('tests/unit/')) return 'test-unit'
  if (filePath.startsWith('tests/integration/')) return 'test-integration'
  if (filePath.startsWith('tests/')) return 'test'
  if (filePath.startsWith('src/')) return 'backend'
  return 'config'
}

export async function scanProjectStructure(): Promise<{
  files: FileInfo[]
  directories: DirInfo[]
  summary: { totalFiles: number; totalLines: number; totalExports: number; totalImports: number; byCategory: Record<string, number> }
}> {
  const fs = await import('node:fs')
  const path = await import('node:path')
  const root = process.cwd()
  const skipDirs = new Set(['node_modules', 'dist', 'generated', '.git', '.next'])
  const exts = new Set(['.ts', '.tsx'])

  const files: FileInfo[] = []
  const dirs: DirInfo[] = []

  function parseFile(filePath: string, content: string): FileInfo {
    const lines = content.split('\n').length
    const exports: string[] = []
    const imports: { from: string; names: string[] }[] = []

    for (const m of content.matchAll(
      /export\s+(?:default\s+)?(?:function|const|let|var|class|type|interface|enum)\s+(\w+)/g,
    )) {
      exports.push(m[1])
    }
    if (
      /export\s+default\s+/.test(content) &&
      !exports.some(
        (e) => content.includes(`export default function ${e}`) || content.includes(`export default class ${e}`),
      )
    ) {
      exports.push('default')
    }

    for (const m of content.matchAll(
      /import\s+(?:\{([^}]+)\}|(\w+))(?:\s*,\s*\{([^}]+)\})?\s+from\s+['"]([^'"]+)['"]/g,
    )) {
      const names: string[] = []
      if (m[1]) names.push(...m[1].split(',').map((s) => s.trim().split(' as ')[0].trim()).filter(Boolean))
      if (m[2]) names.push(m[2])
      if (m[3]) names.push(...m[3].split(',').map((s) => s.trim().split(' as ')[0].trim()).filter(Boolean))
      let from = m[4]
      if (from.startsWith('.')) {
        const dir = path.dirname(filePath)
        from = path.normalize(path.join(dir, from)).replace(/\\/g, '/')
        for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx']) {
          if (fs.existsSync(path.join(root, from + ext))) { from = from + ext; break }
          if (fs.existsSync(path.join(root, from))) break
        }
      }
      imports.push({ from, names })
    }

    return { path: filePath, category: categorize(filePath), lines, exports, imports }
  }

  function scan(dir: string) {
    const absDir = path.join(root, dir)
    if (!fs.existsSync(absDir)) return
    const entries = fs.readdirSync(absDir, { withFileTypes: true })
    let fileCount = 0
    for (const entry of entries) {
      if (skipDirs.has(entry.name)) continue
      const rel = path.join(dir, entry.name).replace(/\\/g, '/')
      if (entry.isDirectory()) {
        scan(rel)
      } else if (exts.has(path.extname(entry.name))) {
        const content = fs.readFileSync(path.join(root, rel), 'utf-8')
        files.push(parseFile(rel, content))
        fileCount++
      }
    }
    dirs.push({ path: dir, category: categorize(`${dir}/`), fileCount })
  }

  for (const d of ['src', 'prisma', 'tests']) scan(d)

  files.sort((a, b) => a.path.localeCompare(b.path))
  dirs.sort((a, b) => a.path.localeCompare(b.path))

  const totalLines = files.reduce((s, f) => s + f.lines, 0)
  const totalExports = files.reduce((s, f) => s + f.exports.length, 0)
  const totalImports = files.reduce((s, f) => s + f.imports.length, 0)
  const byCategory: Record<string, number> = {}
  for (const f of files) byCategory[f.category] = (byCategory[f.category] || 0) + 1

  return {
    files,
    directories: dirs,
    summary: { totalFiles: files.length, totalLines, totalExports, totalImports, byCategory },
  }
}
