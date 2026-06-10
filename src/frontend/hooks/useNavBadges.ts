import { useQuery } from '@tanstack/react-query'

interface RiskSummary {
  overdueTasks: number
  staleTasks: number
  pastDueProjects: number
  missingEnv: number
}

interface RiskReport {
  severity: 'none' | 'low' | 'medium' | 'high'
  summary: RiskSummary
}

export interface NavBadges {
  overdueTasks: number
  pastDueProjects: number
  missingEnv: number
  loaded: boolean
}

export function useNavBadges(enabled = true): NavBadges {
  const risksQ = useQuery({
    queryKey: ['admin', 'overview', 'risks'],
    queryFn: () =>
      fetch('/api/admin/overview/risks', { credentials: 'include' }).then((r) => r.json()) as Promise<RiskReport>,
    refetchInterval: 30_000,
    enabled,
  })

  const s = risksQ.data?.summary
  return {
    overdueTasks: s?.overdueTasks ?? 0,
    pastDueProjects: s?.pastDueProjects ?? 0,
    missingEnv: s?.missingEnv ?? 0,
    loaded: !risksQ.isLoading,
  }
}
