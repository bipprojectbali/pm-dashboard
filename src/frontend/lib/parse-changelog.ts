export type ChangeKind = 'feature' | 'fix' | 'improvement'

export interface ChangeEntry {
  kind: ChangeKind
  text: string
}

export interface WhatsNewVersion {
  version: string
  date: string
  entries: ChangeEntry[]
}

// Mapping judul section (case-insensitive) ke ChangeKind
const SECTION_KIND: Array<[RegExp, ChangeKind]> = [
  [/ditambahkan|tambah|added|fitur|new|feat/i, 'feature'],
  [/diperbaiki|perbaik|fixed|bug/i, 'fix'],
  [/ditingkatkan|tingkat|improved|changed|peningkat/i, 'improvement'],
]

function sectionKind(heading: string): ChangeKind | null {
  for (const [re, kind] of SECTION_KIND) {
    if (re.test(heading)) return kind
  }
  return null
}

export function parseChangelog(raw: string): WhatsNewVersion[] {
  const versions: WhatsNewVersion[] = []
  // Split pada baris yang dimulai dengan "## ["
  const blocks = raw.split(/^## \[/m).slice(1)

  for (const block of blocks) {
    const lines = block.split('\n')
    const header = lines[0] ?? ''
    // Format: 0.4.6] - 2026-05-18
    const headerMatch = header.match(/^([\d.]+)\]\s*-\s*(\d{4}-\d{2}-\d{2})/)
    if (!headerMatch) continue

    const version = headerMatch[1]
    const date = headerMatch[2]
    const entries: ChangeEntry[] = []

    let currentKind: ChangeKind | null = null
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]
      // Section heading "### ..."
      const sectionMatch = line.match(/^###\s+(.+)/)
      if (sectionMatch) {
        currentKind = sectionKind(sectionMatch[1])
        continue
      }
      // Bullet "- text"
      const bulletMatch = line.match(/^-\s+(.+)/)
      if (bulletMatch && currentKind) {
        entries.push({ kind: currentKind, text: bulletMatch[1].trim() })
      }
    }

    if (entries.length > 0) {
      versions.push({ version, date, entries })
    }
  }

  return versions
}

function parseSemver(v: string): [number, number, number] {
  const parts = v.split('.').map(Number)
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0]
}

export function compareVersions(a: string, b: string): number {
  const [aMaj, aMin, aPatch] = parseSemver(a)
  const [bMaj, bMin, bPatch] = parseSemver(b)
  if (aMaj !== bMaj) return aMaj - bMaj
  if (aMin !== bMin) return aMin - bMin
  return aPatch - bPatch
}

export function getVersionsSince(allVersions: WhatsNewVersion[], lastSeen: string | null): WhatsNewVersion[] {
  if (!lastSeen) return allVersions.slice(0, 1)
  return allVersions
    .filter((v) => compareVersions(v.version, lastSeen) > 0)
    .sort((a, b) => compareVersions(b.version, a.version))
}
