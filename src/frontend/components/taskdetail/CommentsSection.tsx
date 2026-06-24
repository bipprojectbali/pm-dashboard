import { Badge, Button, Card, Divider, Group, Stack, Text, Textarea } from '@mantine/core'
import { useEffect, useState } from 'react'
import { UserAvatar } from '../shared/UserAvatar'
import { useWasLoading } from './helpers'
import type { TaskComment } from './types'

export function CommentsSection({
  comments,
  canWrite,
  onSubmit,
  loading,
  error,
}: {
  comments: TaskComment[]
  canWrite: boolean
  onSubmit: (body: string) => void
  loading: boolean
  error?: string
}) {
  const [body, setBody] = useState('')
  const wasLoading = useWasLoading(loading)
  useEffect(() => {
    if (wasLoading && !loading && !error) setBody('')
  }, [wasLoading, loading, error])

  return (
    <Stack gap="sm">
      {comments.length === 0 ? (
        <Text size="sm" c="dimmed">
          No comments yet.
        </Text>
      ) : (
        comments.map((c) => (
          <Card key={c.id} withBorder padding="sm" radius="sm">
            <Group justify="space-between" mb={4} wrap="nowrap">
              <Group gap="xs" wrap="nowrap">
                <UserAvatar name={c.author.name} image={c.author.image} size={22} color="blue" />
                <Text size="xs" fw={600}>
                  {c.author.name}
                </Text>
                <Badge size="xs" variant="light">
                  {c.authorTag}
                </Badge>
              </Group>
              <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                {new Date(c.createdAt).toLocaleString()}
              </Text>
            </Group>
            <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
              {c.body}
            </Text>
          </Card>
        ))
      )}
      {canWrite ? (
        <>
          <Divider />
          <Textarea
            placeholder="Add a comment…"
            value={body}
            onChange={(e) => setBody(e.currentTarget.value)}
            autosize
            minRows={3}
            maxRows={10}
          />
          {error ? (
            <Text size="xs" c="red">
              {error}
            </Text>
          ) : null}
          <Group justify="flex-end">
            <Button
              size="sm"
              onClick={() => onSubmit(body.trim())}
              disabled={!body.trim() || loading}
              loading={loading}
            >
              Comment
            </Button>
          </Group>
        </>
      ) : null}
    </Stack>
  )
}
