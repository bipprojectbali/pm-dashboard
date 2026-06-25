import { ActionIcon, Box, Group, Image, Modal, SimpleGrid, Stack, Text, TextInput, Button } from '@mantine/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { TbExternalLink, TbLink, TbPhoto, TbX } from 'react-icons/tb'
import { notifyError, notifySuccess } from '@/frontend/lib/notify'
import type { TicketDetail } from './types'

export function TicketEvidence({
  evidence,
  ticketId,
}: {
  evidence: TicketDetail['evidence']
  ticketId: string
}) {
  const queryClient = useQueryClient()
  const [url, setUrl] = useState('')
  const [lightbox, setLightbox] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['qc', 'ticket', ticketId] })

  const linkM = useMutation({
    mutationFn: async (u: string) => {
      const res = await fetch(`/api/qc/tickets/${ticketId}/evidence`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: u }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal tambah evidence')
      return json
    },
    onSuccess: () => { setUrl(''); invalidate() },
    onError: (err) => notifyError(err),
  })

  const uploadM = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`/api/qc/tickets/${ticketId}/evidence/upload`, {
        method: 'POST',
        credentials: 'include',
        body: form,
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal upload gambar')
      return json
    },
    onSuccess: () => { notifySuccess({ message: 'Screenshot ditambahkan.' }); invalidate() },
    onError: (err) => notifyError(err),
  })

  const handleFiles = (files: FileList | null) => {
    if (!files) return
    Array.from(files)
      .filter((f) => f.type.startsWith('image/'))
      .forEach((f) => uploadM.mutate(f))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const screenshots = evidence.filter((e) => e.kind === 'SCREENSHOT')
  const links = evidence.filter((e) => e.kind !== 'SCREENSHOT')

  return (
    <Box>
      <Text size="xs" c="dimmed" fw={700} tt="uppercase" mb="xs">Evidence</Text>
      <Stack gap="xs">
        {screenshots.length > 0 && (
          <SimpleGrid cols={4} spacing="xs">
            {screenshots.map((e) => (
              <Box key={e.id} style={{ cursor: 'pointer', position: 'relative' }} onClick={() => setLightbox(e.url)}>
                <Image src={e.url} radius="sm" h={64} fit="cover" />
                {e.note && (
                  <Text size="xs" c="dimmed" truncate mt={2}>{e.note.split(' · ')[0]}</Text>
                )}
              </Box>
            ))}
          </SimpleGrid>
        )}

        {links.map((e) => (
          <Group key={e.id} gap="xs" wrap="nowrap">
            <TbLink size={14} />
            <Text component="a" href={e.url} target="_blank" rel="noopener" size="sm" truncate>
              {e.note || e.url}
            </Text>
            <ActionIcon component="a" href={e.url} target="_blank" rel="noopener" variant="subtle" size="sm">
              <TbExternalLink size={12} />
            </ActionIcon>
          </Group>
        ))}

        <Group gap="xs">
          <TextInput
            style={{ flex: 1 }}
            placeholder="https://… (screenshot, log, repro link)"
            value={url}
            onChange={(e) => setUrl(e.currentTarget.value)}
            size="xs"
          />
          <Button
            size="xs"
            disabled={!url.trim() || linkM.isPending}
            onClick={() => linkM.mutate(url.trim())}
          >
            Tambah
          </Button>
        </Group>

        <Box>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => handleFiles(e.currentTarget.files)}
          />
          <Button
            size="xs"
            variant="light"
            leftSection={<TbPhoto size={13} />}
            loading={uploadM.isPending}
            onClick={() => fileInputRef.current?.click()}
          >
            Upload Screenshot
          </Button>
        </Box>
      </Stack>

      <Modal opened={!!lightbox} onClose={() => setLightbox(null)} size="xl" title="Screenshot" padding="xs">
        {lightbox && <Image src={lightbox} fit="contain" mah="80vh" />}
      </Modal>
    </Box>
  )
}
