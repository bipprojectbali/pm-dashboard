import {
  Badge,
  Button,
  Divider,
  Group,
  Modal,
  ScrollArea,
  Stack,
  Text,
  ThemeIcon,
} from '@mantine/core'
import { TbBug, TbRocket, TbSparkles } from 'react-icons/tb'
import type { ChangeKind, WhatsNewVersion } from '../lib/whats-new'

const KIND_CONFIG: Record<ChangeKind, { icon: React.ReactNode; color: string; label: string }> = {
  feature:     { icon: <TbSparkles size={13} />, color: 'violet', label: 'Fitur Baru' },
  fix:         { icon: <TbBug size={13} />,      color: 'red',    label: 'Perbaikan' },
  improvement: { icon: <TbRocket size={13} />,   color: 'teal',   label: 'Peningkatan' },
}

export function WhatsNewModal({
  opened,
  versions,
  onClose,
}: {
  opened: boolean
  versions: WhatsNewVersion[]
  onClose: () => void
}) {
  if (versions.length === 0) return null
  const latest = versions[0]

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="xs" align="center">
          <Text fw={700} size="lg">Yang Baru</Text>
          <Badge color="violet" variant="filled" size="md">v{latest.version}</Badge>
        </Group>
      }
      size="md"
      centered
      radius="lg"
      scrollAreaComponent={ScrollArea.Autosize}
      styles={{ body: { paddingTop: 8 } }}
    >
      <Stack gap="lg">
        {versions.map((v, vi) => (
          <Stack key={v.version} gap="sm">
            {vi > 0 && (
              <Group gap="xs" align="center">
                <Divider style={{ flex: 1 }} />
                <Badge variant="light" color="gray" size="sm">v{v.version} · {v.date}</Badge>
                <Divider style={{ flex: 1 }} />
              </Group>
            )}
            {vi === 0 && (
              <Text size="xs" c="dimmed">{v.date}</Text>
            )}
            <Stack gap={8}>
              {v.entries.map((entry, i) => {
                const cfg = KIND_CONFIG[entry.kind]
                return (
                  <Group key={i} gap="sm" wrap="nowrap" align="flex-start">
                    <ThemeIcon
                      size="sm"
                      color={cfg.color}
                      variant="light"
                      style={{ flexShrink: 0, marginTop: 1 }}
                    >
                      {cfg.icon}
                    </ThemeIcon>
                    <Text size="sm" style={{ lineHeight: 1.5 }}>{entry.text}</Text>
                  </Group>
                )
              })}
            </Stack>
          </Stack>
        ))}

        <Divider />
        <Button onClick={onClose} fullWidth variant="filled">
          Mengerti, tutup
        </Button>
      </Stack>
    </Modal>
  )
}
