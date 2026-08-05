import { ActionIcon, Box, Button, Group, Stack, Text, TextInput, Tooltip } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { TbCamera, TbCheck, TbPencil, TbTrash, TbX } from 'react-icons/tb'
import { UserAvatar } from '@/frontend/components/shared/UserAvatar'

const MAX_AVATAR_BYTES = 10 * 1024 * 1024

async function parseJsonOrThrow(r: Response, fallback: string) {
  const body = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(body?.error ?? fallback)
  return body
}

// Inline name edit + avatar upload for the Profil tab. Split out of
// ProfileSection.tsx to keep that file within the file-health line limit.
export function ProfileEditCard({ name, image }: { name?: string; image?: string | null }) {
  const qc = useQueryClient()
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(name ?? '')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const saveName = useMutation({
    mutationFn: async (newName: string) => {
      const r = await fetch('/api/me/profile', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      })
      return parseJsonOrThrow(r, 'Gagal menyimpan nama')
    },
    onSuccess: () => {
      setEditingName(false)
      qc.invalidateQueries({ queryKey: ['auth', 'session'] })
      notifications.show({ color: 'teal', title: 'Tersimpan', message: 'Nama kamu sudah diperbarui.' })
    },
    onError: (e: Error) => {
      notifications.show({ color: 'red', title: 'Gagal menyimpan nama', message: e.message })
    },
  })

  const uploadAvatar = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData()
      form.append('file', file)
      const r = await fetch('/api/me/avatar', { method: 'POST', credentials: 'include', body: form })
      return parseJsonOrThrow(r, 'Gagal mengunggah foto')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['auth', 'session'] })
      notifications.show({ color: 'teal', title: 'Tersimpan', message: 'Foto profil sudah diperbarui.' })
    },
    onError: (e: Error) => {
      notifications.show({ color: 'red', title: 'Gagal mengunggah foto', message: e.message })
    },
  })

  const removeAvatar = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/me/avatar', { method: 'DELETE', credentials: 'include' })
      return parseJsonOrThrow(r, 'Gagal menghapus foto')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['auth', 'session'] })
      notifications.show({ color: 'teal', title: 'Terhapus', message: 'Foto profil dihapus.' })
    },
    onError: (e: Error) => {
      notifications.show({ color: 'red', title: 'Gagal menghapus foto', message: e.message })
    },
  })

  const handleFilePick = (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      notifications.show({ color: 'red', title: 'Gagal', message: 'File harus berupa gambar.' })
      return
    }
    if (file.size > MAX_AVATAR_BYTES) {
      notifications.show({ color: 'red', title: 'Gagal', message: 'Ukuran file maksimal 10 MB.' })
      return
    }
    uploadAvatar.mutate(file)
  }

  const startEditName = () => {
    setNameDraft(name ?? '')
    setEditingName(true)
  }

  return (
    <Stack align="center" gap="md">
      <Box pos="relative" w={80} h={80}>
        <UserAvatar name={name} image={image} size={80} color="blue" />
        <Tooltip label="Ubah foto profil">
          <ActionIcon
            variant="filled"
            color="blue"
            radius="xl"
            size="sm"
            pos="absolute"
            bottom={0}
            right={0}
            loading={uploadAvatar.isPending}
            onClick={() => fileInputRef.current?.click()}
          >
            <TbCamera size={14} />
          </ActionIcon>
        </Tooltip>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            handleFilePick(e.currentTarget.files?.[0])
            e.currentTarget.value = ''
          }}
        />
      </Box>

      {image && (
        <Button
          variant="subtle"
          color="red"
          size="compact-xs"
          leftSection={<TbTrash size={12} />}
          loading={removeAvatar.isPending}
          onClick={() => removeAvatar.mutate()}
        >
          Hapus foto
        </Button>
      )}

      {editingName ? (
        <Group gap={6} justify="center" wrap="nowrap">
          <TextInput
            size="sm"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && nameDraft.trim()) saveName.mutate(nameDraft.trim())
              if (e.key === 'Escape') setEditingName(false)
            }}
            autoFocus
            maw={220}
          />
          <ActionIcon
            variant="light"
            color="teal"
            disabled={!nameDraft.trim()}
            loading={saveName.isPending}
            onClick={() => nameDraft.trim() && saveName.mutate(nameDraft.trim())}
          >
            <TbCheck size={16} />
          </ActionIcon>
          <ActionIcon variant="light" color="gray" onClick={() => setEditingName(false)}>
            <TbX size={16} />
          </ActionIcon>
        </Group>
      ) : (
        <Group gap={6} justify="center">
          <Text fw={600} size="lg">
            {name}
          </Text>
          <ActionIcon variant="subtle" color="gray" size="sm" onClick={startEditName}>
            <TbPencil size={14} />
          </ActionIcon>
        </Group>
      )}
    </Stack>
  )
}
