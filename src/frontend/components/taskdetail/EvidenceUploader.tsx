import { Card, Stack, Text } from '@mantine/core'
import { useEffect, useMemo, useState } from 'react'
import { TbCloudUpload, TbUpload } from 'react-icons/tb'

// Drag-drop / click / paste file picker for task evidence. Split out of
// EvidenceSection to keep each file within FILE-HEALTH limits.
export function EvidenceUploader({
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
