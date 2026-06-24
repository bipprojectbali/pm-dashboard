import { ActionIcon, Badge, CopyButton, Group, Tooltip } from '@mantine/core'
import { TbArrowLeft, TbChecks, TbCopy, TbRefresh, TbTrash } from 'react-icons/tb'
import { Breadcrumbs } from '../shared/Breadcrumbs'
import type { TaskDetail } from './types'

type Props = {
  task: TaskDetail | undefined
  taskId: string
  canDelete: boolean
  isSyncing: boolean
  isFetching: boolean
  onBack: () => void
  onRefetch: () => void
  onDelete: () => void
  deletePending: boolean
}

export function TaskDetailHeader({
  task, taskId, canDelete, isSyncing, isFetching,
  onBack, onRefetch, onDelete, deletePending,
}: Props) {
  return (
    <Group
      justify="space-between"
      px="md"
      py="sm"
      style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
    >
      <Group gap="xs" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
        <Tooltip label="Kembali (Esc)">
          <ActionIcon variant="subtle" size="md" onClick={onBack}>
            <TbArrowLeft size={16} />
          </ActionIcon>
        </Tooltip>
        <Breadcrumbs
          items={[
            { label: 'Tasks', onClick: onBack },
            ...(task ? [{ label: task.project.name }] : []),
            { label: task?.title ?? `#${taskId.slice(0, 8)}` },
          ]}
        />
        {task && (
          <CopyButton value={task.id} timeout={1500}>
            {({ copied, copy }) => (
              <Tooltip label={copied ? 'Disalin!' : 'Salin ID'}>
                <ActionIcon variant="subtle" size="sm" color={copied ? 'teal' : 'gray'} onClick={copy}>
                  {copied ? <TbChecks size={13} /> : <TbCopy size={13} />}
                </ActionIcon>
              </Tooltip>
            )}
          </CopyButton>
        )}
      </Group>
      <Group gap={6}>
        {isSyncing && (
          <Badge variant="dot" color="blue" size="xs">
            Sync&hellip;
          </Badge>
        )}
        <Tooltip label="Refresh">
          <ActionIcon variant="subtle" size="md" onClick={onRefetch} loading={isFetching}>
            <TbRefresh size={15} />
          </ActionIcon>
        </Tooltip>
        {task && canDelete && (
          <Tooltip label="Hapus task">
            <ActionIcon variant="subtle" color="red" size="md" onClick={onDelete} loading={deletePending}>
              <TbTrash size={15} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>
    </Group>
  )
}
