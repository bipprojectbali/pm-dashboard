import { Alert, Button, Card, Code, CopyButton, Group, Stack, Text } from '@mantine/core'
import { modals } from '@mantine/modals'
import { TbCheck, TbCopy } from 'react-icons/tb'

// Opens the "token created" modal. The raw token is shown ONCE — after the
// modal closes it can't be retrieved. Also surfaces the agent guide URL + a
// ready-to-run curl snippet so the token can be wired into an agent quickly.
export function openShowOnceModal(raw: string, name: string) {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const docsUrl = `${origin}/api/agent/guide`
  const curlSnippet = `curl -H "Authorization: Bearer ${raw}" ${origin}/api/agent/tasks`
  modals.open({
    title: `Token dibuat: ${name}`,
    size: 'lg',
    children: (
      <Stack gap="sm">
        <Alert color="yellow" variant="light">
          Simpan token ini sekarang — setelah modal ditutup, token tidak bisa dilihat lagi.
        </Alert>
        <Card withBorder padding="sm" radius="sm">
          <Group gap="xs" wrap="nowrap">
            <Code style={{ flex: 1, wordBreak: 'break-all', fontSize: 12 }}>{raw}</Code>
            <CopyButton value={raw}>
              {({ copied, copy }) => (
                <Button size="xs" leftSection={copied ? <TbCheck size={14} /> : <TbCopy size={14} />} onClick={copy}>
                  {copied ? 'Tersalin' : 'Salin'}
                </Button>
              )}
            </CopyButton>
          </Group>
        </Card>
        <Text size="xs" c="dimmed">
          Token untuk agent (Claude Code / CLI) mengakses project ini. Panduan endpoint (butuh token/login):
        </Text>
        <Card withBorder padding="sm" radius="sm">
          <Stack gap={6}>
            <Group gap="xs" wrap="nowrap">
              <Code style={{ flex: 1, wordBreak: 'break-all', fontSize: 12 }}>{docsUrl}</Code>
              <CopyButton value={docsUrl}>
                {({ copied, copy }) => (
                  <Button
                    size="xs"
                    variant="light"
                    leftSection={copied ? <TbCheck size={14} /> : <TbCopy size={14} />}
                    onClick={copy}
                  >
                    {copied ? 'Tersalin' : 'Salin'}
                  </Button>
                )}
              </CopyButton>
            </Group>
            <Group gap="xs" wrap="nowrap">
              <Code style={{ flex: 1, wordBreak: 'break-all', fontSize: 12 }}>{curlSnippet}</Code>
              <CopyButton value={curlSnippet}>
                {({ copied, copy }) => (
                  <Button
                    size="xs"
                    variant="light"
                    leftSection={copied ? <TbCheck size={14} /> : <TbCopy size={14} />}
                    onClick={copy}
                  >
                    {copied ? 'Tersalin' : 'Salin'}
                  </Button>
                )}
              </CopyButton>
            </Group>
          </Stack>
        </Card>
        <Text size="xs" c="dimmed">
          Alternatif interaktif: MCP endpoint <Code>{origin}/mcp</Code> untuk Claude Code.
        </Text>
      </Stack>
    ),
  })
}
