import changelogRaw from '../../../CHANGELOG.md?raw'
import { parseChangelog, compareVersions, getVersionsSince as _getVersionsSince } from './parse-changelog'

export type { ChangeKind, ChangeEntry, WhatsNewVersion } from './parse-changelog'
export { compareVersions } from './parse-changelog'

export const WHATS_NEW = parseChangelog(changelogRaw)

export function getVersionsSince(lastSeen: string | null) {
  return _getVersionsSince(WHATS_NEW, lastSeen)
}
