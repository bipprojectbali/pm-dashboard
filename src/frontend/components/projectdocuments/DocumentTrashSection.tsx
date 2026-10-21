import { Button, Collapse, Divider, Group, Stack, Text } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { TbChevronDown, TbChevronRight, TbTrash } from 'react-icons/tb'
import { notifyError, notifySuccess } from '../../lib/notify'
import { api } from '../ProjectDetailView/types'
import { DocumentRow } from './DocumentRow'
import {
  canRestoreDocument,
  canSeeDocumentTrash,
  type DocumentPermissionCtx,
  type ProjectDocument,
  TRASH_RETENTION_DAYS,
} from './helpers'

/**
 * Trashed documents, collapsed by default, inside the same Documents tab — not
 * a page of its own: trash is something you visit to undo a misclick, not a
 * place you navigate to.
 *
 * `enabled` keeps the extra request off the wire for people who could not
 * restore anything anyway (VIEWER, or a locked project where every write is
 * frozen). The section then renders nothing at all unless this user may restore
 * at least one of the rows that came back.
 */
export function DocumentTrashSection({
  projectId,
  ctx,
  enabled,
}: {
  projectId: string
  ctx: DocumentPermissionCtx
  enabled: boolean
}) {
  const qc = useQueryClient()
  const [opened, { toggle }] = useDisclosure(false)

  // Key is a child of ['project-documents', projectId], so the invalidate the
  // mutations fire — and the server's emitInvalidate('project-documents') —
  // refreshes the live list and the trash together by prefix match.
  const trashQ = useQuery({
    queryKey: ['project-documents', projectId, 'trash'],
    queryFn: () => api<{ documents: ProjectDocument[] }>(`/api/projects/${projectId}/documents/trash`),
    enabled,
  })

  const restore = useMutation({
    mutationFn: (docId: string) =>
      api<{ document: ProjectDocument }>(`/api/projects/${projectId}/documents/${docId}/restore`, {
        method: 'POST',
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['project-documents', projectId] })
      notifySuccess({ message: `Dokumen "${res.document.title}" dipulihkan.` })
    },
    onError: (err) => notifyError(err),
  })

  const trashed = trashQ.data?.documents ?? []
  if (!enabled || !canSeeDocumentTrash(trashed, ctx)) return null

  return (
    <Stack gap="xs">
      <Divider my={4} />
      <Group justify="space-between" wrap="nowrap">
        <Button
          size="xs"
          variant="subtle"
          color="gray"
          leftSection={opened ? <TbChevronDown size={14} /> : <TbChevronRight size={14} />}
          rightSection={<TbTrash size={14} />}
          onClick={toggle}
        >
          Tempat sampah ({trashed.length})
        </Button>
        <Text size="xs" c="dimmed">
          Dihapus permanen setelah {TRASH_RETENTION_DAYS} hari
        </Text>
      </Group>
      <Collapse in={opened}>
        <Stack gap={6}>
          {trashed.map((doc) => (
            <DocumentRow
              key={doc.id}
              doc={doc}
              canDelete={false}
              onDelete={() => {}}
              deleting={false}
              canRestore={canRestoreDocument(doc, ctx)}
              onRestore={() => restore.mutate(doc.id)}
              restoring={restore.isPending && restore.variables === doc.id}
            />
          ))}
        </Stack>
      </Collapse>
    </Stack>
  )
}
