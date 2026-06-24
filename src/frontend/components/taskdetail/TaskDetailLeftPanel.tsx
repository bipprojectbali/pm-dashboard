import { Card, Divider, Stack, Tabs } from '@mantine/core'
import { TbActivity, TbListCheck, TbLock, TbMessage, TbPaperclip } from 'react-icons/tb'
import { ActivityTimelineSection } from './ActivityTimelineSection'
import { ChecklistSection } from './ChecklistSection'
import { CommentsSection } from './CommentsSection'
import { DependenciesSection } from './DependenciesSection'
import { EvidenceSection } from './EvidenceSection'
import { DescriptionSection } from './leftpanel/DescriptionSection'
import { TabCount } from './leftpanel/TabCount'
import { TitleSection } from './leftpanel/TitleSection'
import type { TaskDetailLeftPanelProps } from './leftpanel/types'
import type { ChecklistItem, TaskComment, TaskEvidence } from './types'

export function TaskDetailLeftPanel({
  task,
  canWrite,
  isOverdue,
  editingTitle,
  draftTitle,
  onDraftTitleChange,
  onSaveTitle,
  onCancelTitle,
  editingDescription,
  draftDescription,
  onDraftDescriptionChange,
  onSaveDescription,
  onCancelDescription,
  updatePending,
  onChecklistToggle,
  onChecklistAdd,
  onChecklistRemove,
  checklistAdding,
  onCommentSubmit,
  commentLoading,
  commentError,
  onEvidenceSubmit,
  evidenceLoading,
  evidenceError,
  projectTasks,
  onDependencyAdd,
  onDependencyRemove,
}: TaskDetailLeftPanelProps) {
  return (
    <Stack gap="md" p="md" style={{ borderRight: '1px solid var(--mantine-color-default-border)', minWidth: 0 }}>
      <TitleSection
        task={task}
        canWrite={canWrite}
        isOverdue={isOverdue}
        editingTitle={editingTitle}
        draftTitle={draftTitle}
        onDraftTitleChange={onDraftTitleChange}
        onSaveTitle={onSaveTitle}
        onCancelTitle={onCancelTitle}
        updatePending={updatePending}
      />

      <Divider />

      <DescriptionSection
        description={task.description}
        canWrite={canWrite}
        editingDescription={editingDescription}
        draftDescription={draftDescription}
        onDraftDescriptionChange={onDraftDescriptionChange}
        onSaveDescription={onSaveDescription}
        onCancelDescription={onCancelDescription}
        updatePending={updatePending}
      />

      <Card withBorder radius="md" padding={0} style={{ overflow: 'hidden' }}>
        <Tabs
          defaultValue="checklist"
          keepMounted={false}
          styles={{
            list: { paddingInline: 8, paddingTop: 4, background: 'var(--mantine-color-default-hover)' },
            tab: { fontWeight: 500, fontSize: 'var(--mantine-font-size-xs)' },
          }}
        >
          <Tabs.List>
            <Tabs.Tab
              value="checklist"
              leftSection={<TbListCheck size={13} />}
              rightSection={
                task.checklist.length ? (
                  <TabCount
                    value={`${task.checklist.filter((c: ChecklistItem) => c.done).length}/${task.checklist.length}`}
                    color={task.checklist.every((c: ChecklistItem) => c.done) && task.checklist.length > 0 ? 'green' : 'gray'}
                  />
                ) : undefined
              }
            >
              Checklist
            </Tabs.Tab>
            <Tabs.Tab
              value="comments"
              leftSection={<TbMessage size={13} />}
              rightSection={task.comments.length ? <TabCount value={task.comments.length} /> : undefined}
            >
              Komentar
            </Tabs.Tab>
            <Tabs.Tab
              value="evidence"
              leftSection={<TbPaperclip size={13} />}
              rightSection={task.evidence.length ? <TabCount value={task.evidence.length} /> : undefined}
            >
              Evidence
            </Tabs.Tab>
            <Tabs.Tab
              value="dependencies"
              leftSection={<TbLock size={13} />}
              rightSection={
                task.blockedBy.length + task.blocks.length > 0 ? (
                  <TabCount
                    value={`${task.blockedBy.length}/${task.blocks.length}`}
                    color={task.blockedBy.length > 0 ? 'orange' : 'gray'}
                  />
                ) : undefined
              }
            >
              Deps
            </Tabs.Tab>
            <Tabs.Tab value="activity" leftSection={<TbActivity size={13} />}>
              Aktivitas
            </Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="checklist" p="sm">
            <ChecklistSection
              items={task.checklist}
              canWrite={canWrite}
              onToggle={onChecklistToggle}
              onAdd={onChecklistAdd}
              onRemove={onChecklistRemove}
              adding={checklistAdding}
            />
          </Tabs.Panel>
          <Tabs.Panel value="comments" p="sm">
            <CommentsSection
              comments={task.comments as TaskComment[]}
              canWrite={canWrite}
              onSubmit={onCommentSubmit}
              loading={commentLoading}
              error={commentError}
            />
          </Tabs.Panel>
          <Tabs.Panel value="evidence" p="sm">
            <EvidenceSection
              taskId={task.id}
              items={task.evidence as TaskEvidence[]}
              canWrite={canWrite}
              onSubmit={onEvidenceSubmit}
              loading={evidenceLoading}
              error={evidenceError}
            />
          </Tabs.Panel>
          <Tabs.Panel value="dependencies" p="sm">
            <DependenciesSection
              task={task}
              projectTasks={projectTasks}
              canWrite={canWrite}
              onAdd={onDependencyAdd}
              onRemove={onDependencyRemove}
            />
          </Tabs.Panel>
          <Tabs.Panel value="activity" p="sm">
            <ActivityTimelineSection task={task} />
          </Tabs.Panel>
        </Tabs>
      </Card>
    </Stack>
  )
}
