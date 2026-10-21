import { Alert, Button, Divider, Group, Stack, Text, Textarea, TextInput } from '@mantine/core'
import { modals } from '@mantine/modals'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { TbAlertTriangle, TbFileText, TbRefresh } from 'react-icons/tb'
import { useSession } from '../hooks/useAuth'
import { notifyError, notifySuccess } from '../lib/notify'
import { api } from './ProjectDetailView/types'
import { DocumentRow } from './projectdocuments/DocumentRow'
import { DocumentTrashSection } from './projectdocuments/DocumentTrashSection'
import {
  canDeleteDocument,
  canUploadDocument,
  type DocumentPermissionCtx,
  type ProjectDocument,
  TRASH_RETENTION_DAYS,
  uploadErrorMessage,
} from './projectdocuments/helpers'
import { EmptyState } from './shared/EmptyState'
import { TableSkeleton } from './shared/LoadingState'
import { EvidenceUploader } from './taskdetail/EvidenceUploader'

export function ProjectDocumentsSection({
  projectId,
  myRole,
  systemRole,
  canWrite,
}: {
  projectId: string
  myRole: string | null
  systemRole: string | null
  canWrite: boolean
}) {
  const qc = useQueryClient()
  const session = useSession()
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')

  const ctx: DocumentPermissionCtx = {
    myRole,
    systemRole,
    currentUserId: session.data?.user?.id ?? null,
    canWrite,
  }
  const canUpload = canUploadDocument(ctx)

  const docsQ = useQuery({
    queryKey: ['project-documents', projectId],
    queryFn: () => api<{ documents: ProjectDocument[] }>(`/api/projects/${projectId}/documents`),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['project-documents', projectId] })

  const upload = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData()
      fd.append('file', file)
      if (title.trim()) fd.append('title', title.trim())
      if (note.trim()) fd.append('note', note.trim())
      return api<{ document: ProjectDocument }>(`/api/projects/${projectId}/documents/upload`, {
        method: 'POST',
        body: fd,
      })
    },
    onSuccess: (res) => {
      setTitle('')
      setNote('')
      invalidate()
      notifySuccess({ message: `Dokumen "${res.document.title}" diunggah.` })
    },
    onError: (err) => notifyError(uploadErrorMessage(err)),
  })

  const remove = useMutation({
    mutationFn: (docId: string) =>
      api<{ ok: true }>(`/api/projects/${projectId}/documents/${docId}`, { method: 'DELETE' }),
    onSuccess: () => {
      invalidate()
      notifySuccess({ message: 'Dokumen dipindahkan ke tempat sampah.' })
    },
    onError: (err) => notifyError(err),
  })

  const confirmDelete = (doc: ProjectDocument) =>
    modals.openConfirmModal({
      title: 'Hapus dokumen',
      children: (
        <Text size="sm">
          Pindahkan <b>{doc.title}</b> ke tempat sampah? Berkasnya masih bisa dipulihkan dalam {TRASH_RETENTION_DAYS}{' '}
          hari, setelah itu terhapus permanen.
        </Text>
      ),
      labels: { confirm: 'Pindahkan ke tempat sampah', cancel: 'Batal' },
      confirmProps: { color: 'red' },
      onConfirm: () => remove.mutate(doc.id),
    })

  const documents = docsQ.data?.documents ?? []

  return (
    <Stack gap="sm">
      {canUpload && (
        <Stack gap="xs">
          <Group grow align="flex-start">
            <TextInput
              size="xs"
              label="Judul (opsional)"
              placeholder="mis. Surat Perjanjian Kerja Sama"
              value={title}
              onChange={(e) => setTitle(e.currentTarget.value)}
            />
            <Textarea
              size="xs"
              label="Catatan (opsional)"
              placeholder="mis. Versi tanda tangan basah, arsip asli di lemari HRD"
              value={note}
              onChange={(e) => setNote(e.currentTarget.value)}
              autosize
              minRows={1}
              maxRows={3}
            />
          </Group>
          <EvidenceUploader
            onPick={(file) => upload.mutate(file)}
            loading={upload.isPending}
            label="Seret berkas ke sini atau klik untuk memilih"
            hint="Judul dan catatan di atas akan dipakai untuk berkas yang kamu pilih berikutnya. Kosongkan judul untuk memakai nama berkas."
          />
          <Divider my={4} />
        </Stack>
      )}

      {docsQ.isLoading ? (
        <TableSkeleton rows={3} height={56} />
      ) : docsQ.error ? (
        <Alert color="red" radius="md" icon={<TbAlertTriangle size={18} />} title="Gagal memuat dokumen">
          <Stack gap="sm" align="flex-start">
            <Text size="sm">{(docsQ.error as Error).message}</Text>
            <Button
              size="xs"
              variant="light"
              color="red"
              leftSection={<TbRefresh size={14} />}
              onClick={() => docsQ.refetch()}
              loading={docsQ.isFetching}
            >
              Coba lagi
            </Button>
          </Stack>
        </Alert>
      ) : documents.length === 0 ? (
        <EmptyState
          icon={TbFileText}
          color="blue"
          title="Belum ada dokumen"
          message={
            canUpload
              ? 'Unggah dokumen proyek, artefak, atau surat-surat di sini supaya tersimpan dengan riwayat yang bisa dilacak.'
              : 'Belum ada dokumen yang diunggah untuk proyek ini.'
          }
        />
      ) : (
        <Stack gap={6}>
          {documents.map((doc) => (
            <DocumentRow
              key={doc.id}
              doc={doc}
              canDelete={canDeleteDocument(doc, ctx)}
              onDelete={() => confirmDelete(doc)}
              deleting={remove.isPending && remove.variables === doc.id}
            />
          ))}
        </Stack>
      )}

      {/* Outside the list branches on purpose: the trash can hold rows even
          when the live list is empty, which is exactly when someone needs it. */}
      <DocumentTrashSection projectId={projectId} ctx={ctx} enabled={canUpload} />
    </Stack>
  )
}
