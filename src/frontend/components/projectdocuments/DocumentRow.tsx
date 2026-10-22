import { ActionIcon, Badge, Box, Card, Group, Stack, Text, Tooltip } from '@mantine/core'
import type { ComponentType } from 'react'
import {
  TbArrowBackUp,
  TbDownload,
  TbEye,
  TbFile,
  TbFileSpreadsheet,
  TbFileText,
  TbFileTypePdf,
  TbFileZip,
  TbPhoto,
  TbTrash,
} from 'react-icons/tb'
import { canPreviewDocument } from '../../../lib/document-preview'
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

/**
 * One document row, in either of two modes. A trashed row drops the download
 * link on purpose: the serve route 404s a trashed document, so offering the
 * button would be a dead end — and for the same reason it gets no preview
 * control either, whatever its type.
 */
export function DocumentRow({
  doc,
  canDelete,
  onDelete,
  deleting,
  canRestore = false,
  onRestore,
  restoring = false,
  onPreview,
}: {
  doc: ProjectDocument
  canDelete: boolean
  onDelete: () => void
  deleting: boolean
  canRestore?: boolean
  onRestore?: () => void
  restoring?: boolean
  /** Omitted by the trash list, which must not offer a preview at all. */
  onPreview?: () => void
}) {
  const trashed = doc.deletedAt !== null
  // Asking the server's own allowlist, so a type the route refuses to send
  // inline never gets a control that would open an empty frame.
  const previewable = onPreview != null && !trashed && canPreviewDocument(doc.mimeType)
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
            {trashed && (
              <Badge size="xs" variant="light" color="orange">
                Di tempat sampah
              </Badge>
            )}
            <Text size="xs" c="dimmed">
              {formatFileSize(doc.sizeBytes)}
            </Text>
            <Text size="xs" c="dimmed">
              · diunggah {doc.uploadedBy?.name ?? 'pengguna terhapus'} · {formatDate(doc.createdAt)}
            </Text>
            {trashed && doc.deletedAt && (
              <Text size="xs" c="dimmed">
                · dihapus {formatDate(doc.deletedAt)}
              </Text>
            )}
          </Group>
        </Stack>

        <Group gap={4} wrap="nowrap">
          {previewable && (
            <Tooltip label="Pratinjau dokumen" withArrow>
              <ActionIcon variant="subtle" size="sm" onClick={onPreview} aria-label={`Pratinjau ${doc.title}`}>
                <TbEye size={15} />
              </ActionIcon>
            </Tooltip>
          )}
          {!trashed && (
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
          )}
          {trashed && canRestore && (
            <Tooltip label="Pulihkan dokumen" withArrow>
              <ActionIcon
                variant="subtle"
                color="teal"
                size="sm"
                loading={restoring}
                onClick={onRestore}
                aria-label={`Pulihkan ${doc.title}`}
              >
                <TbArrowBackUp size={15} />
              </ActionIcon>
            </Tooltip>
          )}
          {!trashed && canDelete && (
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
