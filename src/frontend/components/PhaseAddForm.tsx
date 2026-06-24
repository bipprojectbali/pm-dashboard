import { Button, Card, Group, Stack, Text, TextInput } from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { TbPlus } from 'react-icons/tb'
import { notifyError, notifySuccess } from '../lib/notify'

type PhaseCreateInput = {
  title: string
  status: string
  startsAt: string | null
  endsAt: string | null
}

async function createPhase(projectId: string, body: PhaseCreateInput) {
  const res = await fetch(`/api/projects/${projectId}/phases`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
  return res.json()
}

export function PhaseAddForm({ projectId, onSuccess }: { projectId: string; onSuccess: () => void }) {
  const [title, setTitle] = useState('')
  const [startsAt, setStartsAt] = useState<Date | null>(null)
  const [endsAt, setEndsAt] = useState<Date | null>(null)

  const create = useMutation({
    mutationFn: (body: PhaseCreateInput) => createPhase(projectId, body),
    onSuccess: () => {
      setTitle('')
      setStartsAt(null)
      setEndsAt(null)
      notifySuccess({ message: 'Fase dibuat.' })
      onSuccess()
    },
    onError: (err) => notifyError(err),
  })

  const submit = () => {
    if (!title.trim() || create.isPending) return
    create.mutate({
      title: title.trim(),
      status: 'PLANNING',
      startsAt: startsAt?.toISOString() ?? null,
      endsAt: endsAt?.toISOString() ?? null,
    })
  }

  return (
    <Card withBorder padding="sm" radius="md">
      <Stack gap="xs">
        <Text size="xs" fw={600} c="dimmed">
          Tambah Fase
        </Text>
        <TextInput
          placeholder="Nama fase"
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
          size="xs"
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
        />
        <Group gap="xs" wrap="nowrap">
          <DateInput
            highlightToday
            placeholder="Mulai (opsional)"
            value={startsAt}
            onChange={(v) => setStartsAt(v ? new Date(v as unknown as string) : null)}
            clearable
            size="xs"
            w={170}
          />
          <Text size="xs" c="dimmed">
            –
          </Text>
          <DateInput
            highlightToday
            placeholder="Selesai (opsional)"
            value={endsAt}
            onChange={(v) => setEndsAt(v ? new Date(v as unknown as string) : null)}
            clearable
            size="xs"
            w={170}
          />
          <Button
            leftSection={<TbPlus size={13} />}
            size="xs"
            disabled={!title.trim() || create.isPending}
            loading={create.isPending}
            onClick={submit}
          >
            Tambah
          </Button>
        </Group>
      </Stack>
    </Card>
  )
}
