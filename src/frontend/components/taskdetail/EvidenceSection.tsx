import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Card,
  Divider,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core'
import { modals } from '@mantine/modals'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { TbCloudUpload, TbTrash, TbUpload } from 'react-icons/tb'
import { notifyError, notifySuccess } from '../../lib/notify'
import { useWasLoading } from './helpers'
import type { TaskEvidence } from './types'

export function EvidenceSection({
  taskId,
  items,
  canWrite,
  onSubmit,
  loading,
  error,
}: {
  taskId: string
  items: TaskEvidence[]
  canWrite: boolean
  onSubmit: (body: { kind: string; url: string; note?: string }) => void
  loading: boolean
  error?: string
}) {
  const qc = useQueryClient()
  const [kind, setKind] = useState<string>('LINK')
  const [url, setUrl] = useState('')
  const [note, setNote] = useState('')
  const wasLoading = useWasLoading(loading)
  useEffect(() => {
    if (wasLoading && !loading && !error) {
      setUrl('')
      setNote('')
    }
  }, [wasLoading, loading, error])

  const upload = useMutation({
    mutationFn: async ({ file, note: n }: { file: File; note?: string }) => {
      const fd = new FormData()
      fd.append('file', file)
      if (n) fd.append('note', n)
      const res = await fetch(`/api/tasks/${taskId}/evidence/upload`, {
        method: 'POST',
        credentials: 'include',
        body: fd,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Upload failed' }))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      return res.json() as Promise<{ evidence: TaskEvidence }>
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', taskId] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
      notifySuccess({ message: 'Evidence di-upload.' })
    },
    onError: (err) => notifyError(err),
  })

  const remove = useMutation({
    mutationFn: async (evidenceId: string) => {
      const res = await fetch(`/api/tasks/${taskId}/evidence/${evidenceId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Delete failed' }))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', taskId] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
      notifySuccess({ message: 'Evidence dihapus.' })
    },
    onError: (err) => notifyError(err),
  })

  const confirmDelete = (evidenceId: string) =>
    modals.openConfirmModal({
      title: 'Hapus evidence',
      children: <Text size="sm">Hapus evidence ini permanen? File yang di-upload juga akan dihapus.</Text>,
      labels: { confirm: 'Hapus', cancel: 'Batal' },
      confirmProps: { color: 'red' },
      onConfirm: () => remove.mutate(evidenceId),
    })

  return (
    <Stack gap="sm">
      {items.length === 0 ? (
        <Text size="sm" c="dimmed">
          No evidence attached.
        </Text>
      ) : (
        items.map((e) => (
          <Card key={e.id} withBorder padding="sm" radius="sm">
            <Group justify="space-between" mb={4}>
              <Badge size="sm" variant="light">
                {e.kind}
              </Badge>
              <Group gap="xs">
                <Text size="xs" c="dimmed">
                  {new Date(e.createdAt).toLocaleString()}
                </Text>
                {canWrite ? (
                  <Tooltip label="Hapus evidence" withArrow>
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      color="red"
                      loading={remove.isPending}
                      onClick={() => confirmDelete(e.id)}
                    >
                      <TbTrash size={14} />
                    </ActionIcon>
                  </Tooltip>
                ) : null}
              </Group>
            </Group>
            {e.kind === 'SCREENSHOT' && e.url.startsWith('/api/evidence/') ? (
              <Anchor href={e.url} target="_blank" rel="noreferrer">
                <img
                  src={e.url}
                  alt={e.note ?? 'screenshot'}
                  style={{ maxWidth: '100%', maxHeight: 320, borderRadius: 4, display: 'block' }}
                />
              </Anchor>
            ) : (
              <Anchor href={e.url} target="_blank" rel="noreferrer" size="sm">
                {e.url}
              </Anchor>
            )}
            {e.note ? (
              <Text size="xs" c="dimmed" mt={4}>
                {e.note}
              </Text>
            ) : null}
          </Card>
        ))
      )}
      {canWrite ? (
        <>
          <Divider label="Upload file" labelPosition="center" />
          <EvidenceUploader
            onPick={(file) => upload.mutate({ file, note: note.trim() || undefined })}
            loading={upload.isPending}
            error={upload.error ? (upload.error as Error).message : undefined}
          />
          <Divider label="Or attach URL" labelPosition="center" />
          <Group grow>
            <Select
              label="Kind"
              size="sm"
              data={['LINK', 'SCREENSHOT', 'LOG', 'OTHER']}
              value={kind}
              onChange={(v) => setKind(v ?? 'LINK')}
            />
            <TextInput
              label="URL"
              size="sm"
              placeholder="https://…"
              value={url}
              onChange={(e) => setUrl(e.currentTarget.value)}
            />
          </Group>
          <TextInput label="Note (optional)" size="sm" value={note} onChange={(e) => setNote(e.currentTarget.value)} />
          {error ? (
            <Text size="xs" c="red">
              {error}
            </Text>
          ) : null}
          <Group justify="flex-end">
            <Button
              size="sm"
              onClick={() => onSubmit({ kind, url: url.trim(), note: note.trim() || undefined })}
              disabled={!url.trim() || loading}
              loading={loading}
            >
              Attach URL
            </Button>
          </Group>
        </>
      ) : null}
    </Stack>
  )
}

function EvidenceUploader({
  onPick,
  loading,
  error,
}: {
  onPick: (file: File) => void
  loading: boolean
  error?: string
}) {
  const [dragOver, setDragOver] = useState(false)
  const [pastedHint, setPastedHint] = useState(false)
  const inputId = useMemo(() => `evidence-upload-${Math.random().toString(36).slice(2, 8)}`, [])

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return
    onPick(files[0])
  }

  // Paste an image straight from the clipboard (e.g. a screenshot). The uploader
  // only mounts while the Evidence tab is open, so a document listener is scoped
  // enough; we still skip pastes aimed at a text field so note-typing isn't hijacked.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (loading) return
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return
      const file = Array.from(e.clipboardData?.items ?? [])
        .find((it) => it.kind === 'file' && it.type.startsWith('image/'))
        ?.getAsFile()
      if (!file) return
      e.preventDefault()
      setPastedHint(true)
      setTimeout(() => setPastedHint(false), 1500)
      onPick(file)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [loading, onPick])

  return (
    <Stack gap={6}>
      <label htmlFor={inputId}>
        <Card
          withBorder
          radius="md"
          padding="lg"
          style={{
            borderStyle: 'dashed',
            borderColor: dragOver ? 'var(--mantine-color-blue-5)' : undefined,
            backgroundColor: dragOver ? 'var(--mantine-color-blue-0)' : undefined,
            cursor: loading ? 'wait' : 'pointer',
            opacity: loading ? 0.7 : 1,
            transition: 'all 120ms ease',
          }}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            if (loading) return
            handleFiles(e.dataTransfer.files)
          }}
        >
          <Stack gap={4} align="center">
            <TbCloudUpload size={28} />
            <Text size="sm" fw={500}>
              {loading
                ? 'Uploading…'
                : dragOver
                  ? 'Drop file to upload'
                  : pastedHint
                    ? 'Gambar dari clipboard ditambahkan'
                    : 'Drag & drop, klik, atau tempel (paste) gambar'}
            </Text>
            <Text size="xs" c="dimmed">
              Screenshot, log, PDF — atau Ctrl/Cmd+V untuk menempel gambar dari clipboard
            </Text>
          </Stack>
        </Card>
      </label>
      <input
        id={inputId}
        type="file"
        style={{ display: 'none' }}
        disabled={loading}
        onChange={(e) => {
          handleFiles(e.currentTarget.files)
          e.currentTarget.value = ''
        }}
      />
      {error ? (
        <Text size="xs" c="red">
          <TbUpload size={10} style={{ marginRight: 4 }} />
          {error}
        </Text>
      ) : null}
    </Stack>
  )
}
