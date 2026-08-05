import { ActionIcon, Group, Stack, Text, TextInput } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { TbCheck, TbPencil, TbX } from 'react-icons/tb'
import { UserAvatar } from '@/frontend/components/shared/UserAvatar'

async function parseJsonOrThrow(r: Response, fallback: string) {
  const body = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(body?.error ?? fallback)
  return body
}

// Inline name edit for the Profil tab. Split out of ProfileSection.tsx to
// keep that file within the file-health line limit.
export function ProfileEditCard({ name, image }: { name?: string; image?: string | null }) {
  const qc = useQueryClient()
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(name ?? '')

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

  const startEditName = () => {
    setNameDraft(name ?? '')
    setEditingName(true)
  }

  return (
    <Stack align="center" gap="md">
      <UserAvatar name={name} image={image} size={80} color="blue" />

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
