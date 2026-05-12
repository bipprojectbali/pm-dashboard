import {
  ActionIcon,
  Alert,
  Anchor,
  Card,
  Group,
  Loader,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import { Badge } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { TbBrandGithub, TbRefresh } from 'react-icons/tb'
import type { ProjectDetail } from './ProjectsPanel'

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'include', ...init })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

type GithubEventKind = 'PUSH_COMMIT' | 'PR_OPENED' | 'PR_CLOSED' | 'PR_MERGED' | 'PR_REVIEWED'

interface GithubContributor {
  login: string
  commits: number
}

interface GithubOpenPr {
  prNumber: number | null
  title: string
  url: string
  actorLogin: string
  createdAt: string
}

interface GithubRecentEvent {
  id: string
  kind: GithubEventKind
  actorLogin: string
  actorEmail: string | null
  title: string
  url: string
  sha: string | null
  prNumber: number | null
  createdAt: string
  matchedUser: { id: string; name: string; email: string } | null
}

interface GithubSummary {
  linked: boolean
  repo: string | null
  stats?: {
    commits7d: number
    commits30d: number
    contributors30d: number
    openPrs: number
    lastPushAt: string | null
    lastPushBy: string | null
  }
  contributors?: GithubContributor[]
  openPrs?: GithubOpenPr[]
  recent?: GithubRecentEvent[]
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 0) return 'just now'
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const days = Math.floor(hr / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

const EVENT_KIND_COLOR: Record<GithubRecentEvent['kind'], string> = {
  PUSH_COMMIT: 'blue',
  PR_OPENED: 'teal',
  PR_CLOSED: 'gray',
  PR_MERGED: 'grape',
  PR_REVIEWED: 'yellow',
}

const EVENT_KIND_LABEL: Record<GithubRecentEvent['kind'], string> = {
  PUSH_COMMIT: 'commit',
  PR_OPENED: 'PR opened',
  PR_CLOSED: 'PR closed',
  PR_MERGED: 'PR merged',
  PR_REVIEWED: 'PR reviewed',
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Text size="xs" c="dimmed" tt="uppercase" fw={500}>
        {label}
      </Text>
      <Text fw={700} size="lg">
        {value}
      </Text>
    </div>
  )
}

export function GithubActivityCard({ project }: { project: ProjectDetail }) {
  const linked = !!project.githubRepo
  const q = useQuery({
    queryKey: ['project-github-summary', project.id],
    queryFn: () => api<GithubSummary>(`/api/projects/${project.id}/github/summary`),
    enabled: linked,
    staleTime: 30_000,
  })

  if (!linked) {
    return (
      <Card withBorder padding="md" radius="md">
        <Stack gap="xs" align="flex-start">
          <Group gap="xs">
            <ThemeIcon variant="light" size="md" radius="sm">
              <TbBrandGithub size={16} />
            </ThemeIcon>
            <Text fw={600} size="sm">
              GitHub activity
            </Text>
          </Group>
          <Text size="sm" c="dimmed">
            No repo linked yet. Add a GitHub repo in Settings to pull in commits, pull requests, and reviews.
          </Text>
        </Stack>
      </Card>
    )
  }

  return (
    <Card withBorder padding="md" radius="md">
      <Stack gap="sm">
        <Group justify="space-between" wrap="wrap" gap="xs">
          <Group gap="xs">
            <ThemeIcon variant="light" size="md" radius="sm">
              <TbBrandGithub size={16} />
            </ThemeIcon>
            <Text fw={600} size="sm">
              GitHub activity
            </Text>
            {project.githubRepo && (
              <Anchor
                size="xs"
                c="dimmed"
                href={`https://github.com/${project.githubRepo}`}
                target="_blank"
                rel="noreferrer noopener"
              >
                {project.githubRepo}
              </Anchor>
            )}
          </Group>
          <Tooltip label="Refresh">
            <ActionIcon variant="subtle" size="sm" onClick={() => q.refetch()} loading={q.isFetching}>
              <TbRefresh size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>

        {q.isLoading ? (
          <Group gap="xs">
            <Loader size="xs" />
            <Text size="sm" c="dimmed">
              Loading activity…
            </Text>
          </Group>
        ) : q.error ? (
          <Alert color="red" title="Failed to load GitHub activity">
            {(q.error as Error).message}
          </Alert>
        ) : q.data?.stats ? (
          <>
            <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="xs">
              <MiniStat label="Commits / 7d" value={String(q.data.stats.commits7d)} />
              <MiniStat label="Contributors / 30d" value={String(q.data.stats.contributors30d)} />
              <MiniStat label="Open PRs" value={String(q.data.stats.openPrs)} />
              <MiniStat label="Last push" value={formatRelativeTime(q.data.stats.lastPushAt)} />
            </SimpleGrid>

            {!q.data.recent || q.data.recent.length === 0 ? (
              <Text size="sm" c="dimmed">
                No activity received yet. Once the webhook fires, events will appear here.
              </Text>
            ) : (
              <Stack gap={4} mt="xs">
                <Text size="xs" fw={600} c="dimmed" tt="uppercase">
                  Recent events
                </Text>
                {q.data.recent.slice(0, 10).map((ev) => (
                  <Group key={ev.id} gap="xs" wrap="nowrap" align="flex-start">
                    <Badge color={EVENT_KIND_COLOR[ev.kind]} variant="light" size="xs" style={{ flexShrink: 0 }}>
                      {EVENT_KIND_LABEL[ev.kind]}
                    </Badge>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <Text size="sm" truncate>
                        {ev.kind === 'PUSH_COMMIT'
                          ? ev.title || ev.sha?.slice(0, 7) || 'commit'
                          : `#${ev.prNumber ?? '?'} ${ev.title}`}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {ev.matchedUser?.name ?? ev.actorLogin} · {formatRelativeTime(ev.createdAt)}
                        {ev.url && (
                          <>
                            {' · '}
                            <Anchor size="xs" href={ev.url} target="_blank" rel="noreferrer noopener">
                              view
                            </Anchor>
                          </>
                        )}
                      </Text>
                    </div>
                  </Group>
                ))}
              </Stack>
            )}
          </>
        ) : null}
      </Stack>
    </Card>
  )
}
