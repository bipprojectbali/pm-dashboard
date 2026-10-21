import { ActionIcon, Badge, Box, Card, Group, Stack, Text, Tooltip } from '@mantine/core'
import type { ComponentType } from 'react'
import {
  TbDownload,
  TbFile,
  TbFileSpreadsheet,
  TbFileText,
  TbFileTypePdf,
  TbFileZip,
  TbPhoto,
  TbTrash,
} from 'react-icons/tb'
import { formatDate } from '../ProjectDetailView/types'
import { type DocumentKind, documentKind, formatFileSize, type ProjectDocument } from './helpers'

const KIND_ICON: Record<DocumentKind, ComponentType<{ size?: number | string }>> = {
  image: TbPhoto,
  pdf: TbFileTypePdf,
  doc: TbFileText,
  sheet: TbFileSpreadsheet,
  archive: TbFileZip,
  other: TbFile,
}

const KIND_COLOR: Record<DocumentKind, string> = {
  image: 'violet',
  pdf: 'red',
  doc: 'blue',
  sheet: 'teal',
  archive: 'orange',
  other: 'gray',
}

export function DocumentRow({
  doc,
  canDelete,
  onDelete,
  deleting,
}: {
  doc: ProjectDocument
  canDelete: boolean
  onDelete: () => void
  deleting: boolean
}) {
  const kind = documentKind(doc.mimeType)
  const Icon = KIND_ICON[kind]
  const color = KIND_COLOR[kind]

  return (
    <Card withBorder padding="sm" radius="md">
      <Group gap="sm" wrap="nowrap" align="flex-start">
        <Box
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: `var(--mantine-color-${color}-light)`,
            color: `var(--mantine-color-${color}-filled)`,
          }}
        >
          <Icon size={18} />
        </Box>

        <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
          <Text size="sm" fw={600} style={{ wordBreak: 'break-word' }}>
            {doc.title}
          </Text>
          <Text size="xs" c="dimmed" style={{ wordBreak: 'break-all' }}>
            {doc.originalName}
          </Text>
          {doc.note && (
            <Text size="xs" c="dimmed" lh={1.5} mt={2}>
              {doc.note}
            </Text>
          )}
          <Group gap={6} wrap="wrap" mt={4}>
            <Badge size="xs" variant="light" color={color}>
              {doc.mimeType}
            </Badge>
            <Text size="xs" c="dimmed">
              {formatFileSize(doc.sizeBytes)}
            </Text>
            <Text size="xs" c="dimmed">
              · diunggah {doc.uploadedBy?.name ?? 'pengguna terhapus'} · {formatDate(doc.createdAt)}
            </Text>
          </Group>
        </Stack>

        <Group gap={4} wrap="nowrap">
          <Tooltip label="Buka atau unduh" withArrow>
            <ActionIcon
              component="a"
              href={doc.url}
              target="_blank"
              rel="noreferrer"
              variant="subtle"
              size="sm"
              aria-label={`Unduh ${doc.title}`}
            >
              <TbDownload size={15} />
            </ActionIcon>
          </Tooltip>
          {canDelete && (
            <Tooltip label="Hapus dokumen" withArrow>
              <ActionIcon
                variant="subtle"
                color="red"
                size="sm"
                loading={deleting}
                onClick={onDelete}
                aria-label={`Hapus ${doc.title}`}
              >
                <TbTrash size={15} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      </Group>
    </Card>
  )
}
