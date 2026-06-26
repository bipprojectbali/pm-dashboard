import { ActionIcon, Alert, Anchor, Badge, Box, Button, Group, Image, Modal, Select, SimpleGrid, Stack, Text, Textarea, TextInput } from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { TbAlertTriangle, TbPhoto, TbTrash, TbX } from 'react-icons/tb'
import { notifyError, notifySuccess } from '@/frontend/lib/notify'

interface SimilarTicket { id: string; title: string; status: string; priority: string; score: number }

export function CreateTicketModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('MEDIUM')
  const [route, setRoute] = useState('')
  const [evidence, setEvidence] = useState('')
  const [images, setImages] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!opened) {
      setTitle('')
      setDescription('')
      setPriority('MEDIUM')
      setRoute('')
      setEvidence('')
      setImages([])
      setPreviews((prev) => { prev.forEach(URL.revokeObjectURL); return [] })
    }
  }, [opened])

  const addImages = (files: FileList | null) => {
    if (!files) return
    const newFiles = Array.from(files).filter((f) => f.type.startsWith('image/'))
    setImages((prev) => [...prev, ...newFiles])
    setPreviews((prev) => [...prev, ...newFiles.map((f) => URL.createObjectURL(f))])
  }

  const removeImage = (i: number) => {
    URL.revokeObjectURL(previews[i])
    setImages((prev) => prev.filter((_, idx) => idx !== i))
    setPreviews((prev) => prev.filter((_, idx) => idx !== i))
  }

  const createM = useMutation({
    mutationFn: async () => {
      const urls = evidence.split('\n').map((s) => s.trim()).filter(Boolean)
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
      const ticketId: string = json.ticket.id
      for (const file of images) {
        const form = new FormData()
        form.append('file', file)
        await fetch(`/api/qc/tickets/${ticketId}/evidence/upload`, {
          method: 'POST',
          credentials: 'include',
          body: form,
        })
      }
      return json
    },
    onSuccess: () => {
      notifySuccess({ message: 'Ticket dibuat.' })
      queryClient.invalidateQueries({ queryKey: ['qc'] })
      onClose()
    },
    onError: (err) => notifyError(err),
  })

  const [debouncedTitle] = useDebouncedValue(title, 300)
  const similarQuery = useQuery({
    queryKey: ['qc', 'similar', debouncedTitle.trim()],
    enabled: opened && debouncedTitle.trim().length >= 4,
    queryFn: async () => {
      const res = await fetch(`/api/qc/tickets/similar?title=${encodeURIComponent(debouncedTitle.trim())}`, {
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal memeriksa duplikat')
      return (json.possibleDuplicates ?? []) as SimilarTicket[]
    },
  })
  const duplicates = similarQuery.data ?? []

  const openExisting = (id: string) => {
    onClose()
    navigate({ to: '/qc', search: (prev) => ({ ...prev, status: prev.status ?? 'all', ticketId: id }) })
  }

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

        <Box>
          <Text size="sm" fw={500} mb={6}>Screenshot (optional)</Text>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => addImages(e.currentTarget.files)}
          />
          {previews.length > 0 && (
            <SimpleGrid cols={4} spacing="xs" mb="xs">
              {previews.map((src, i) => (
                <Box key={src} style={{ position: 'relative' }}>
                  <Image src={src} radius="sm" h={80} fit="cover" />
                  <ActionIcon
                    size="xs"
                    color="red"
                    variant="filled"
                    style={{ position: 'absolute', top: 2, right: 2 }}
                    onClick={() => removeImage(i)}
                  >
                    <TbX size={10} />
                  </ActionIcon>
                </Box>
              ))}
            </SimpleGrid>
          )}
          <Button
            size="xs"
            variant="light"
            leftSection={<TbPhoto size={13} />}
            onClick={() => fileInputRef.current?.click()}
          >
            Pilih Gambar
          </Button>
        </Box>

        <Textarea
          label="Evidence URLs (optional, one per line)"
          placeholder="https://...&#10;https://..."
          value={evidence}
          onChange={(e) => setEvidence(e.currentTarget.value)}
          autosize
          minRows={2}
        />
        {duplicates.length > 0 && (
          <Alert
            color="yellow"
            icon={<TbAlertTriangle size={16} />}
            title="Mungkin duplikat"
            variant="light"
          >
            <Text size="sm" mb={6}>
              Ada ticket dengan judul mirip. Cek dulu sebelum membuat yang baru:
            </Text>
            <Stack gap={4}>
              {duplicates.map((d) => (
                <Group key={d.id} gap={6} wrap="nowrap">
                  <Anchor size="sm" onClick={() => openExisting(d.id)} style={{ flex: 1 }} lineClamp={1}>
                    {d.title}
                  </Anchor>
                  <Badge size="xs" variant="light" color="gray">{d.status}</Badge>
                </Group>
              ))}
            </Stack>
          </Alert>
        )}
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
