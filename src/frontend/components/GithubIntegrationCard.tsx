import {
  Anchor,
  Badge,
  Button,
  Card,
  Code,
  CopyButton,
  Group,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
} from '@mantine/core'
import { TbBrandGithub } from 'react-icons/tb'
import type { ProjectDetail } from './ProjectsPanel'

export function previewGithubRepo(input: string): string | null {
  const s = input
    .trim()
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '')
  if (!s) return null
  const https = s.match(/^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/?#]+)/i)
  if (https) return `${https[1]}/${https[2]}`.toLowerCase()
  const ssh = s.match(/^git@github\.com:([^/]+)\/([^/?#]+)/i)
  if (ssh) return `${ssh[1]}/${ssh[2]}`.toLowerCase()
  const plain = s.match(/^([A-Za-z0-9][A-Za-z0-9-_.]*)\/([A-Za-z0-9][A-Za-z0-9-_.]*)$/)
  if (plain) return `${plain[1]}/${plain[2]}`.toLowerCase()
  return null
}

export function GithubIntegrationCard({
  project,
  canManage,
  value,
  onChange,
  onSave,
  onUnlink,
  saving,
  error,
}: {
  project: ProjectDetail
  canManage: boolean
  value: string
  onChange: (v: string) => void
  onSave: (repo: string) => void
  onUnlink: () => void
  saving: boolean
  error: Error | null
}) {
  const preview = previewGithubRepo(value)
  const trimmed = value.trim()
  const invalid = trimmed.length > 0 && !preview
  const changed = (preview ?? '') !== (project.githubRepo ?? '')
  const webhookUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/webhooks/github`

  return (
    <Card withBorder padding="md" radius="md">
      <Stack gap="sm">
        <Group gap="xs">
          <ThemeIcon variant="light" size="md" radius="sm">
            <TbBrandGithub size={16} />
          </ThemeIcon>
          <Text fw={600} size="sm">
            GitHub integration
          </Text>
          {project.githubRepo && (
            <Badge color="green" variant="light" size="sm">
              Linked
            </Badge>
          )}
        </Group>
        <Text size="xs" c="dimmed">
          Link a GitHub repo to capture commits, pull requests, and reviews as project activity. Paste any form of repo
          URL — we'll normalize to <Code>owner/repo</Code>.
        </Text>
        <TextInput
          label="GitHub repo"
          placeholder="https://github.com/owner/repo or owner/repo"
          value={value}
          onChange={(e) => onChange(e.currentTarget.value)}
          disabled={!canManage}
          error={invalid ? 'Not a valid GitHub repo reference' : undefined}
          description={
            preview ? (
              <Text size="xs" c="dimmed">
                Will be stored as <Code>{preview}</Code>
              </Text>
            ) : undefined
          }
        />
        {error && changed && (
          <Text size="sm" c="red">
            {error.message}
          </Text>
        )}
        {canManage && (
          <Group justify="flex-end" gap="xs">
            {project.githubRepo && (
              <Button
                variant="subtle"
                color="red"
                size="xs"
                onClick={() => {
                  onChange('')
                  onUnlink()
                }}
                disabled={saving}
              >
                Unlink
              </Button>
            )}
            <Button
              size="xs"
              disabled={!changed || invalid || saving}
              loading={saving && changed}
              onClick={() => onSave(preview ?? '')}
            >
              {project.githubRepo ? 'Update link' : 'Link repo'}
            </Button>
          </Group>
        )}

        {project.githubRepo && (
          <Stack gap={4} mt="xs">
            <Text size="xs" fw={600} c="dimmed">
              Webhook setup
            </Text>
            <Text size="xs" c="dimmed">
              In your repo → Settings → Webhooks → Add webhook. Content type <Code>application/json</Code>. Secret is
              your <Code>GITHUB_WEBHOOK_SECRET</Code>. Events: <i>Pushes</i>, <i>Pull requests</i>,{' '}
              <i>Pull request reviews</i>.
            </Text>
            <Group gap="xs" wrap="nowrap">
              <Code style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{webhookUrl}</Code>
              <CopyButton value={webhookUrl}>
                {({ copied, copy }) => (
                  <Button size="compact-xs" variant="light" color={copied ? 'teal' : undefined} onClick={copy}>
                    {copied ? 'Copied' : 'Copy URL'}
                  </Button>
                )}
              </CopyButton>
            </Group>
            <Anchor
              size="xs"
              href={`https://github.com/${project.githubRepo}/settings/hooks/new`}
              target="_blank"
              rel="noreferrer noopener"
            >
              Open GitHub webhook settings →
            </Anchor>
          </Stack>
        )}
      </Stack>
    </Card>
  )
}
