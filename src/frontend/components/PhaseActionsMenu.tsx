import { ActionIcon, Menu } from '@mantine/core'
import { TbCheck, TbDotsVertical, TbEdit, TbEye, TbPlayerPlay, TbTrash } from 'react-icons/tb'
import type { ProjectPhase } from './phase.types'

export function PhaseActionsMenu({
  phase,
  onView,
  onStart,
  onComplete,
  onEdit,
  onDelete,
}: {
  phase: ProjectPhase
  onView: () => void
  onStart: () => void
  onComplete: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <Menu shadow="md" position="bottom-end" withinPortal>
      <Menu.Target>
        <ActionIcon
          size="sm"
          variant="subtle"
          color="gray"
          aria-label={`Kelola fase ${phase.title}`}
          onClick={(e) => e.stopPropagation()}
        >
          <TbDotsVertical size={14} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown onClick={(e) => e.stopPropagation()}>
        <Menu.Item leftSection={<TbEye size={14} />} onClick={onView}>
          Lihat Detail
        </Menu.Item>
        {phase.status === 'PLANNING' && (
          <Menu.Item leftSection={<TbPlayerPlay size={14} />} onClick={onStart}>
            Mulai Fase
          </Menu.Item>
        )}
        {phase.status === 'ACTIVE' && (
          <Menu.Item leftSection={<TbCheck size={14} />} onClick={onComplete}>
            Selesaikan Fase
          </Menu.Item>
        )}
        <Menu.Item leftSection={<TbEdit size={14} />} onClick={onEdit}>
          Edit Fase
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item color="red" leftSection={<TbTrash size={14} />} onClick={onDelete}>
          Hapus Fase
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  )
}
