import { Badge, Button, ColorSwatch, Group, MultiSelect, Stack, Text, Tooltip } from '@mantine/core'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { TbTag } from 'react-icons/tb'
import type { EventTag } from './types'
import { api } from './types'

const TAG_COLORS = ['blue', 'teal', 'green', 'yellow', 'orange', 'red', 'pink', 'grape', 'violet', 'cyan', 'gray']
const CREATE_PREFIX = '__create__:'

export function TagSelector({
  tagIds,
  onChange,
  allTags,
  onTagCreated,
}: {
  tagIds: string[]
  onChange: (ids: string[]) => void
  allTags: EventTag[]
  onTagCreated: (tag: EventTag) => void
}) {
  const [search, setSearch] = useState('')
  const [newColor, setNewColor] = useState('blue')
  const [pendingName, setPendingName] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)

  const createTag = useMutation({
    mutationFn: (name: string) =>
      api<{ tag: EventTag }>('/api/event-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color: newColor }),
      }),
    onSuccess: ({ tag }) => {
      onTagCreated(tag)
      onChange([...tagIds, tag.id])
      setPendingName(null)
      setNewColor('blue')
      setCreateError(null)
    },
    onError: (e) => setCreateError(e.message),
  })

  const exactMatch = allTags.some((t) => t.name.toLowerCase() === search.trim().toLowerCase())
  const data = [
    ...allTags.map((t) => ({ value: t.id, label: t.name })),
    ...(search.trim() && !exactMatch
      ? [{ value: `${CREATE_PREFIX}${search.trim()}`, label: `+ Buat "${search.trim()}"` }]
      : []),
  ]

  const handleChange = (values: string[]) => {
    const createVal = values.find((v) => v.startsWith(CREATE_PREFIX))
    if (createVal) {
      setPendingName(createVal.slice(CREATE_PREFIX.length))
      onChange(values.filter((v) => !v.startsWith(CREATE_PREFIX)))
    } else {
      onChange(values)
    }
  }

  return (
    <Stack gap={6}>
      <MultiSelect
        label="Tag"
        placeholder="Cari atau buat tag baru..."
        leftSection={<TbTag size={14} />}
        data={data}
        value={tagIds}
        onChange={handleChange}
        searchable
        searchValue={search}
        onSearchChange={setSearch}
        clearable
        renderOption={({ option }) => {
          const tag = allTags.find((t) => t.id === option.value)
          if (!tag) return <Text size="sm">{option.label}</Text>
          return (
            <Group gap={6}>
              <Badge size="xs" color={tag.color} variant="filled" circle>{' '}</Badge>
              <Text size="sm">{tag.name}</Text>
            </Group>
          )
        }}
      />
      {pendingName && (
        <Stack gap={6} p="xs" style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-sm)' }}>
          <Text size="xs" fw={600}>Pilih warna untuk &quot;{pendingName}&quot;</Text>
          <Group gap={4} wrap="wrap">
            {TAG_COLORS.map((c) => (
              <Tooltip key={c} label={c} withArrow>
                <ColorSwatch
                  color={`var(--mantine-color-${c}-5)`}
                  size={20}
                  style={{ cursor: 'pointer', outline: c === newColor ? '2px solid var(--mantine-color-blue-5)' : undefined, outlineOffset: 2 }}
                  onClick={() => setNewColor(c)}
                />
              </Tooltip>
            ))}
          </Group>
          {createError && <Text size="xs" c="red">{createError}</Text>}
          <Group gap={6}>
            <Button size="compact-xs" loading={createTag.isPending} onClick={() => createTag.mutate(pendingName)}>
              Buat Tag
            </Button>
            <Button size="compact-xs" variant="subtle" color="gray" onClick={() => { setPendingName(null); setCreateError(null) }}>
              Batal
            </Button>
          </Group>
        </Stack>
      )}
    </Stack>
  )
}
