// Server state for the phases section: load phases + tags, update/delete
// mutations, and the shared cache-invalidation used after every write.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { notifyError, notifySuccess } from '../../lib/notify'
import type { ProjectPhase, TagOption } from '../phase.types'
import { phasesApi, TEMPLATE_PHASES } from './phases-api'

export function usePhasesData(projectId: string) {
  const qc = useQueryClient()
  const [isTemplating, setIsTemplating] = useState(false)

  const phasesQ = useQuery({
    queryKey: ['phases', projectId],
    queryFn: () => phasesApi<{ phases: ProjectPhase[] }>(`/api/projects/${projectId}/phases`),
  })

  const tagsQ = useQuery({
    queryKey: ['tags', projectId],
    queryFn: () => phasesApi<{ tags: TagOption[] }>(`/api/projects/${projectId}/tags`),
  })
  const availableTags = tagsQ.data?.tags ?? []

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['phases', projectId] })
    // ['project', projectId] adalah sumber badge _count.phases di ProjectTabs —
    // tanpa ini badge stuck di angka lama setelah create/delete fase.
    qc.invalidateQueries({ queryKey: ['project', projectId] })
    qc.invalidateQueries({ queryKey: ['projects'] })
    qc.invalidateQueries({ queryKey: ['tasks'] })
  }

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      phasesApi(`/api/phases/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      invalidate()
      notifySuccess({ message: 'Fase diperbarui.' })
    },
    onError: (err) => notifyError(err),
  })

  const remove = useMutation({
    mutationFn: (id: string) => phasesApi(`/api/phases/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      invalidate()
      notifySuccess({ message: 'Fase dihapus.' })
    },
    onError: (err) => notifyError(err),
  })

  const handleTemplate = async () => {
    setIsTemplating(true)
    try {
      for (const t of TEMPLATE_PHASES) {
        const res = await fetch(`/api/projects/${projectId}/phases`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: t.title,
            description: t.description,
            status: 'PLANNING',
            startsAt: null,
            endsAt: null,
          }),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
      }
      invalidate()
      notifySuccess({ message: 'Template fase dibuat.' })
    } catch (err) {
      notifyError(err instanceof Error ? err : new Error('Gagal membuat template'))
    } finally {
      setIsTemplating(false)
    }
  }

  const allPhases = phasesQ.data?.phases ?? []

  return { phasesQ, allPhases, availableTags, invalidate, update, remove, isTemplating, handleTemplate }
}
