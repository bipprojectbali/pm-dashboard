import { Button, Group, MultiSelect, Stack, TextInput } from '@mantine/core'
import { useState } from 'react'
import { TbPlus, TbTag } from 'react-icons/tb'
import type { TagListItem } from './types'

export function TagsPicker({
  projectId: _projectId,
  currentTagIds,
  availableTags,
  onChange,
  onCreate,
  creating,
}: {
  projectId: string
  currentTagIds: string[]
  availableTags: TagListItem[]
  onChange: (tagIds: string[]) => void
  onCreate: (name: string) => void
  creating: boolean
}) {
  const [newName, setNewName] = useState('')

  return (
    <Stack gap={4}>
      <MultiSelect
        label="Tags"
        placeholder="Pick tags"
        size="sm"
        leftSection={<TbTag size={14} />}
        data={availableTags.map((t) => ({ value: t.id, label: t.name }))}
        value={currentTagIds}
        onChange={onChange}
        searchable
        clearable
      />
      <Group gap="xs" wrap="nowrap">
        <TextInput
          size="sm"
          placeholder="New tag name"
          value={newName}
          onChange={(e) => setNewName(e.currentTarget.value)}
          style={{ flex: 1 }}
        />
        <Button
          size="sm"
          variant="light"
          leftSection={<TbPlus size={14} />}
          disabled={!newName.trim() || creating}
          loading={creating}
          onClick={() => {
            onCreate(newName.trim())
            setNewName('')
          }}
        >
          Create tag
        </Button>
      </Group>
    </Stack>
  )
}
