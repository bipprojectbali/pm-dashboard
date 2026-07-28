// Client-side filter/search/view + pagination state and the derived,
// filtered/paginated phase lists the section renders.
import { useLocalStorage } from '@mantine/hooks'
import { useEffect, useMemo, useState } from 'react'
import type { PhaseStatus, PhaseView, ProjectPhase } from '../phase.types'

const PAGE_SIZE = 10

export function usePhasesFilter(allPhases: ProjectPhase[]) {
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [view, setView] = useLocalStorage<PhaseView>({ key: 'pm:phases:view', defaultValue: 'stepper' })
  const [statusFilter, setStatusFilter] = useLocalStorage<PhaseStatus | 'ALL'>({
    key: 'pm:phases:statusFilter',
    defaultValue: 'ALL',
  })
  const [page, setPage] = useState(1)

  // Hitung jumlah per status dari set yang sudah difilter-tag (bukan status),
  // supaya angka di badge status mencerminkan populasi yang relevan.
  const tagFilteredPhases = useMemo(
    () => (tagFilter ? allPhases.filter((p) => p.tags.some((t) => t.tagId === tagFilter)) : allPhases),
    [allPhases, tagFilter],
  )
  const statusCounts = useMemo(
    () => ({
      PLANNING: tagFilteredPhases.filter((p) => p.status === 'PLANNING').length,
      ACTIVE: tagFilteredPhases.filter((p) => p.status === 'ACTIVE').length,
      COMPLETED: tagFilteredPhases.filter((p) => p.status === 'COMPLETED').length,
    }),
    [tagFilteredPhases],
  )

  const phases = useMemo(() => {
    const q = search.trim().toLowerCase()
    return tagFilteredPhases.filter((p) => {
      if (statusFilter !== 'ALL' && p.status !== statusFilter) return false
      if (q && !p.title.toLowerCase().includes(q)) return false
      return true
    })
  }, [tagFilteredPhases, statusFilter, search])

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [tagFilter, statusFilter, search])

  const totalPages = Math.ceil(phases.length / PAGE_SIZE)
  const pageOffset = (page - 1) * PAGE_SIZE
  const paginatedPhases = useMemo(() => phases.slice(pageOffset, pageOffset + PAGE_SIZE), [phases, pageOffset])

  // "Active step" hanya bermakna saat urutan penuh (tak difilter/dicari).
  // Saat difilter, urutan tak lengkap → jangan auto-highlight (active = -1).
  const isFiltered = statusFilter !== 'ALL' || search.trim() !== ''
  const stepperActive = useMemo(() => {
    if (isFiltered) return -1
    const idx = phases.findIndex((p) => p.status === 'ACTIVE')
    if (idx >= 0) return idx
    return phases.filter((p) => p.status === 'COMPLETED').length
  }, [phases, isFiltered])

  return {
    tagFilter,
    setTagFilter,
    search,
    setSearch,
    view,
    setView,
    statusFilter,
    setStatusFilter,
    page,
    setPage,
    statusCounts,
    phases,
    paginatedPhases,
    totalPages,
    pageOffset,
    stepperActive,
    PAGE_SIZE,
  }
}
