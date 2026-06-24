import { Button, Group, Modal, Select, Stack, Textarea, TextInput } from '@mantine/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { notifyError, notifySuccess } from '@/frontend/lib/notify'

export function CreateTicketModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('MEDIUM')
  const [route, setRoute] = useState('')
  const [evidence, setEvidence] = useState('')

  useEffect(() => {
    if (!opened) {
      setTitle('')
      setDescription('')
      setPriority('MEDIUM')
      setRoute('')
      setEvidence('')
    }
  }, [opened])

  const createM = useMutation({
    mutationFn: async () => {
      const urls = evidence
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
      const res = await fetch('/api/qc/tickets', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          priority,
          route: route || undefined,
          evidenceUrls: urls.length ? urls : undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal membuat ticket')
      return json
    },
    onSuccess: () => {
      notifySuccess({ message: 'Ticket dibuat.' })
      queryClient.invalidateQueries({ queryKey: ['qc'] })
      onClose()
    },
    onError: (err) => notifyError(err),
  })

  const canSubmit = title.trim().length > 0 && description.trim().length > 0 && !createM.isPending

  return (
    <Modal opened={opened} onClose={onClose} title="New QC Ticket" size="lg">
      <Stack gap="sm">
        <TextInput
          label="Title"
          placeholder="Short summary, e.g. Login button freeze setelah 2 klik"
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
          required
          maxLength={500}
        />
        <Textarea
          label="Description"
          placeholder="Steps to reproduce, expected vs actual, env, etc."
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
          minRows={5}
          autosize
          required
        />
        <Group grow>
          <Select
            label="Priority"
            value={priority}
            onChange={(v) => v && setPriority(v as typeof priority)}
            data={[
              { value: 'LOW', label: 'Low' },
              { value: 'MEDIUM', label: 'Medium' },
              { value: 'HIGH', label: 'High' },
              { value: 'CRITICAL', label: 'Critical' },
            ]}
          />
          <TextInput
            label="Route / area (optional)"
            placeholder="/admin?tab=users"
            value={route}
            onChange={(e) => setRoute(e.currentTarget.value)}
          />
        </Group>
        <Textarea
          label="Evidence URLs (optional, one per line)"
          placeholder="https://...&#10;https://..."
          value={evidence}
          onChange={(e) => setEvidence(e.currentTarget.value)}
          autosize
          minRows={2}
        />
        <Group justify="flex-end" mt="sm">
          <Button variant="subtle" onClick={onClose}>Batal</Button>
          <Button onClick={() => createM.mutate()} disabled={!canSubmit} loading={createM.isPending}>
            Buat Ticket
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
