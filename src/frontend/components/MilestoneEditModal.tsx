import { Button, Group, Modal, MultiSelect, Stack, Textarea, TextInput } from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { useState } from 'react'

export interface TagListItem {
  id: string
  name: string
  color: string
}

export interface MilestoneFormData {
  title: string
  description: string
  dueAt: Date | null
  tagIds: string[]
}

interface MilestoneEditModalProps {
  opened: boolean
  onClose: () => void
  onSubmit: (data: MilestoneFormData) => void
  isPending: boolean
  availableTags: TagListItem[]
  initialData?: {
    title: string
    description: string | null
    dueAt: string | null
    tagIds: string[]
  }
}

export function MilestoneEditModal({
  opened,
  onClose,
  onSubmit,
  isPending,
  availableTags,
  initialData,
}: MilestoneEditModalProps) {
  const isEdit = !!initialData

  const [title, setTitle] = useState(initialData?.title ?? '')
  const [description, setDescription] = useState(initialData?.description ?? '')
  const [dueAt, setDueAt] = useState<Date | null>(initialData?.dueAt ? new Date(initialData.dueAt) : null)
  const [tagIds, setTagIds] = useState<string[]>(initialData?.tagIds ?? [])

  function handleSubmit() {
    if (!title.trim()) return
    onSubmit({ title: title.trim(), description, dueAt, tagIds })
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={isEdit ? 'Edit Milestone' : 'Tambah Milestone'}
      size="md"
    >
      <Stack gap="sm">
        <TextInput
          label="Judul"
          placeholder="Misal: MVP launch"
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
          required
          data-autofocus
        />
        <Textarea
          label="Deskripsi"
          placeholder="Deskripsi opsional..."
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
          minRows={2}
          maxRows={5}
          autosize
        />
        <DateInput
          label="Deadline"
          placeholder="Pilih tanggal"
          value={dueAt}
          onChange={(v) => setDueAt(v ? new Date(v as unknown as string) : null)}
          clearable
          highlightToday
        />
        {availableTags.length > 0 && (
          <MultiSelect
            label="Tags"
            placeholder="Pilih tag"
            data={availableTags.map((t) => ({ value: t.id, label: t.name }))}
            value={tagIds}
            onChange={setTagIds}
            searchable
            clearable
          />
        )}
        <Group justify="flex-end" mt="xs">
          <Button variant="default" onClick={onClose} disabled={isPending}>
            Batal
          </Button>
          <Button onClick={handleSubmit} loading={isPending} disabled={!title.trim()}>
            {isEdit ? 'Simpan' : 'Tambah'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
