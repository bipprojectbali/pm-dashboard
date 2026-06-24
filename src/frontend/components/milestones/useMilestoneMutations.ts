import { useMutation, useQueryClient } from '@tanstack/react-query'
import { notifyError, notifySuccess } from '../../lib/notify'
import { api } from './helpers'

type Opts = {
  projectId: string
  onCreateSuccess: () => void
  onUpdateSuccess: () => void
}

export function useMilestoneMutations({ projectId, onCreateSuccess, onUpdateSuccess }: Opts) {
  const qc = useQueryClient()

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['milestones', projectId] })
    qc.invalidateQueries({ queryKey: ['milestones', 'all'] })
    qc.invalidateQueries({ queryKey: ['projects'] })
  }

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/api/projects/${projectId}/milestones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      invalidate()
      onCreateSuccess()
      notifySuccess({ message: 'Milestone dibuat.' })
    },
    onError: (err) => notifyError(err),
  })

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api(`/api/milestones/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      invalidate()
      onUpdateSuccess()
      notifySuccess({ message: 'Milestone diperbarui.' })
    },
    onError: (err) => notifyError(err),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/milestones/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      invalidate()
      notifySuccess({ message: 'Milestone dihapus.' })
    },
    onError: (err) => notifyError(err),
  })

  return { create, update, remove }
}
