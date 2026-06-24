import type { EChartsOption } from 'echarts'
import type { AnalyticsTask, TaskStatus } from './types'

export function buildContributorsOption(tasks: AnalyticsTask[], windowStartMs: number): EChartsOption {
  const counts = new Map<string, number>()
  for (const t of tasks) {
    if (!t.closedAt || !t.assignee) continue
    if (new Date(t.closedAt).getTime() < windowStartMs) continue
    counts.set(t.assignee.name, (counts.get(t.assignee.name) ?? 0) + 1)
  }
  const sorted = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .reverse()
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 100, right: 24, top: 16, bottom: 28 },
    xAxis: { type: 'value', minInterval: 1 },
    yAxis: {
      type: 'category',
      data: sorted.map(([name]) => name),
      axisLabel: { fontSize: 11 },
    },
    series: [
      {
        type: 'bar',
        data: sorted.map(([, n]) => n),
        itemStyle: { color: '#7950f2', borderRadius: [0, 4, 4, 0] },
        label: { show: true, position: 'right', fontSize: 10 },
      },
    ],
  }
}

export function buildProjectWipOption(tasks: AnalyticsTask[]): EChartsOption {
  const counts = new Map<string, number>()
  for (const t of tasks) {
    if (t.status === 'CLOSED') continue
    counts.set(t.project.name, (counts.get(t.project.name) ?? 0) + 1)
  }
  const sorted = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .reverse()
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 140, right: 24, top: 16, bottom: 28 },
    xAxis: { type: 'value', minInterval: 1 },
    yAxis: {
      type: 'category',
      data: sorted.map(([name]) => name),
      axisLabel: { fontSize: 11 },
    },
    series: [
      {
        type: 'bar',
        data: sorted.map(([, n]) => n),
        itemStyle: { color: '#228be6', borderRadius: [0, 4, 4, 0] },
        label: { show: true, position: 'right', fontSize: 10 },
      },
    ],
  }
}

export function buildCycleBucketsOption(tasks: AnalyticsTask[], windowStartMs: number): EChartsOption {
  const buckets = { '≤1d': 0, '1–3d': 0, '3–7d': 0, '1–2w': 0, '2w–1m': 0, '>1m': 0 }
  for (const t of tasks) {
    if (!t.closedAt) continue
    if (new Date(t.closedAt).getTime() < windowStartMs) continue
    const start = new Date(t.startsAt ?? t.createdAt).getTime()
    const end = new Date(t.closedAt).getTime()
    const d = (end - start) / (1000 * 60 * 60 * 24)
    if (!Number.isFinite(d) || d < 0) continue
    if (d <= 1) buckets['≤1d']++
    else if (d <= 3) buckets['1–3d']++
    else if (d <= 7) buckets['3–7d']++
    else if (d <= 14) buckets['1–2w']++
    else if (d <= 30) buckets['2w–1m']++
    else buckets['>1m']++
  }
  const labels = Object.keys(buckets)
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 40, right: 16, top: 16, bottom: 28 },
    xAxis: { type: 'category', data: labels, axisLabel: { fontSize: 10 } },
    yAxis: { type: 'value', minInterval: 1 },
    series: [
      {
        type: 'bar',
        data: labels.map((k) => buckets[k as keyof typeof buckets]),
        itemStyle: {
          color: (p: { dataIndex: number }) => {
            const palette = ['#40c057', '#51cf66', '#94d82d', '#fab005', '#fd7e14', '#fa5252']
            return palette[p.dataIndex] ?? '#868e96'
          },
          borderRadius: [4, 4, 0, 0],
        },
        label: { show: true, position: 'top', fontSize: 10 },
      },
    ],
  }
}

export function buildAgingWipOption(tasks: AnalyticsTask[]): EChartsOption {
  const now = Date.now()
  const open = tasks
    .filter((t) => t.status !== 'CLOSED')
    .map((t) => {
      const anchor = new Date(t.updatedAt ?? t.createdAt).getTime()
      return {
        title: t.title,
        project: t.project.name,
        status: t.status,
        ageDays: Math.max(0, Math.round((now - anchor) / (1000 * 60 * 60 * 24))),
      }
    })
    .sort((a, b) => b.ageDays - a.ageDays)
    .slice(0, 12)
    .reverse()
  const statusColor: Record<TaskStatus, string> = {
    OPEN: '#228be6',
    IN_PROGRESS: '#7950f2',
    READY_FOR_QC: '#fab005',
    REOPENED: '#fd7e14',
    CLOSED: '#40c057',
  }
  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: unknown) => {
        const arr = params as Array<{ dataIndex: number; value: number; name: string }>
        const row = open[arr[0].dataIndex]
        if (!row) return ''
        return `<b>${row.title}</b><br/>${row.project}<br/>${row.status} · ${row.ageDays} hari`
      },
    },
    grid: { left: 140, right: 48, top: 16, bottom: 28 },
    xAxis: { type: 'value', name: 'hari', nameTextStyle: { fontSize: 10 } },
    yAxis: {
      type: 'category',
      data: open.map((r) => (r.title.length > 22 ? `${r.title.slice(0, 22)}…` : r.title)),
      axisLabel: { fontSize: 10 },
    },
    series: [
      {
        type: 'bar',
        data: open.map((r) => ({ value: r.ageDays, itemStyle: { color: statusColor[r.status] } })),
        label: { show: true, position: 'right', fontSize: 10, formatter: '{c}d' },
        itemStyle: { borderRadius: [0, 4, 4, 0] },
      },
    ],
  }
}
