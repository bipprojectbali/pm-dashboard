import changelogRaw from '../../../CHANGELOG.md?raw'
import { getVersionsSince as _getVersionsSince, parseChangelog } from './parse-changelog'

export type { ChangeEntry, ChangeKind, WhatsNewVersion } from './parse-changelog'
export { compareVersions } from './parse-changelog'

export const WHATS_NEW = parseChangelog(changelogRaw)

export function getVersionsSince(lastSeen: string | null) {
  return _getVersionsSince(WHATS_NEW, lastSeen)
}
