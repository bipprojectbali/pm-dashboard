import { Alert, Anchor, Center, Group, Image, Loader, Modal, Stack, Text } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { TbAlertTriangle, TbDownload } from 'react-icons/tb'
// The same allowlist the serve route enforces — not a frontend copy of it. If
// this disagreed with the server, the modal would either hide a preview that
// works or mount a viewer for bytes the server sends as an attachment.
import { type DocumentPreviewKind, documentPreviewKind } from '../../../lib/document-preview'
import { formatFileSize, type ProjectDocument } from './helpers'

/**
 * Beyond this, a text file is pasted into the DOM as one node and the tab
 * stalls. The download control is still right there, so the cap costs the user
 * nothing a preview was going to give them.
 */
const TEXT_PREVIEW_MAX_BYTES = 512 * 1024

function PreviewFallback({ doc, message }: { doc: ProjectDocument; message: string }) {
  return (
    <Stack gap="xs" align="flex-start">
      <Text size="sm">{message}</Text>
      <Anchor href={doc.url} target="_blank" rel="noreferrer" size="sm">
        <Group gap={6}>
          <TbDownload size={15} />
          Unduh {doc.originalName}
        </Group>
      </Anchor>
    </Stack>
  )
}

function TextPreview({ doc }: { doc: ProjectDocument }) {
  const q = useQuery({
    queryKey: ['project-document-text', doc.id],
    queryFn: async () => {
      // Not the shared `api()` helper: that one ends in res.json(), and this
      // body is text/plain. credentials are still needed — the serve route is
      // session-gated and the bucket itself stays private.
      const res = await fetch(doc.url, { credentials: 'include' })
      if (!res.ok) throw new Error(`Gagal memuat berkas (HTTP ${res.status}).`)
      return res.text()
    },
    retry: false,
  })

  if (q.isLoading) {
    return (
      <Center h={160}>
        <Loader size="sm" />
      </Center>
    )
  }
  if (q.error) {
    return (
      <Alert color="red" radius="md" icon={<TbAlertTriangle size={18} />}>
        {(q.error as Error).message}
      </Alert>
    )
  }
  return (
    // Plain React children, never dangerouslySetInnerHTML: the whole point of
    // the inline allowlist is that uploaded bytes are data, not markup. React
    // escapes this, so a .txt full of tags shows as tags.
    <Text
      component="pre"
      size="xs"
      style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, maxHeight: '65vh', overflow: 'auto' }}
    >
      {q.data}
    </Text>
  )
}

function PreviewBody({ doc, kind }: { doc: ProjectDocument; kind: DocumentPreviewKind }) {
  if (kind === 'image') {
    return <Image src={doc.url} alt={doc.title} fit="contain" mah="70vh" />
  }
  if (kind === 'pdf') {
    return (
      <iframe src={doc.url} title={doc.title} style={{ width: '100%', height: '70vh', border: 0, borderRadius: 8 }} />
    )
  }
  if (doc.sizeBytes > TEXT_PREVIEW_MAX_BYTES) {
    return (
      <PreviewFallback
        doc={doc}
        message={`Berkas teks ini terlalu besar untuk dipratinjau (${formatFileSize(doc.sizeBytes)}). Unduh untuk membukanya.`}
      />
    )
  }
  return <TextPreview doc={doc} />
}

/**
 * One instance for the whole Documents tab, driven by which document is in
 * state — not one modal per row. `doc === null` means closed.
 *
 * Trashed documents never reach here: the row only offers the control for live
 * rows, and the serve route 404s a trashed document anyway, so a preview would
 * be a guaranteed broken frame.
 */
export function DocumentPreviewModal({ doc, onClose }: { doc: ProjectDocument | null; onClose: () => void }) {
  const kind = doc ? documentPreviewKind(doc.mimeType) : null

  return (
    <Modal opened={doc !== null} onClose={onClose} title={doc?.title ?? 'Pratinjau'} size="xl" centered>
      {doc && kind ? (
        <Stack gap="sm">
          {/* Remounted per document id, so switching rows refetches the text
              body instead of showing the previous file's contents. */}
          <PreviewBody key={doc.id} doc={doc} kind={kind} />
          <Group gap={6} justify="space-between">
            <Text size="xs" c="dimmed" style={{ wordBreak: 'break-all' }}>
              {doc.originalName} · {formatFileSize(doc.sizeBytes)}
            </Text>
            <Anchor href={doc.url} target="_blank" rel="noreferrer" size="xs">
              <Group gap={4}>
                <TbDownload size={13} />
                Unduh
              </Group>
            </Anchor>
          </Group>
        </Stack>
      ) : (
        doc && <PreviewFallback doc={doc} message="Jenis berkas ini tidak bisa dipratinjau di browser dengan aman." />
      )}
    </Modal>
  )
}
