import type { EChartsOption } from 'echarts'
import { toLocalDateStr } from '@/frontend/lib/dates'
import type { OverviewTask } from './types'

export function buildStatusDonutOption(activeMine: OverviewTask[]): EChartsOption {
  const buckets: Record<OverviewTask['status'], number> = {
    OPEN: 0,
    IN_PROGRESS: 0,
    READY_FOR_QC: 0,
    REOPENED: 0,
    CLOSED: 0,
  }
  for (const t of activeMine) buckets[t.status]++
  const total = activeMine.length
  return {
    tooltip: { trigger: 'item', formatter: '{b}: <b>{c}</b> ({d}%)' },
    legend: { bottom: 0, itemWidth: 10, itemHeight: 10, textStyle: { fontSize: 11 } },
    series: [
      {
        type: 'pie',
        radius: ['55%', '80%'],
        center: ['50%', '42%'],
        avoidLabelOverlap: true,
        label: {
          show: true,
          position: 'center',
          formatter: () => `{n|${total}}\n{l|aktif}`,
          rich: {
            n: { fontSize: 22, fontWeight: 700, color: 'var(--mantine-color-text)' },
            l: { fontSize: 10, color: 'var(--mantine-color-dimmed)', padding: [4, 0, 0, 0] },
          },
        },
        data: [
          { name: 'Open', value: buckets.OPEN, itemStyle: { color: '#228be6' } },
          { name: 'In Progress', value: buckets.IN_PROGRESS, itemStyle: { color: '#7950f2' } },
          { name: 'Ready for QC', value: buckets.READY_FOR_QC, itemStyle: { color: '#fab005' } },
          { name: 'Reopened', value: buckets.REOPENED, itemStyle: { color: '#fd7e14' } },
        ],
      },
    ],
  }
}

export function buildClosedTrendOption(myTasks: OverviewTask[]): EChartsOption {
  const days: Array<{ key: string; label: string; count: number }> = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - i)
    const key = toLocalDateStr(d)
    days.push({ key, label: key.slice(5), count: 0 })
  }
  const index = new Map(days.map((d, i) => [d.key, i]))
  for (const t of myTasks) {
    if (!t.closedAt) continue
    const d = new Date(t.closedAt)
    d.setHours(0, 0, 0, 0)
    const i = index.get(toLocalDateStr(d))
    if (i !== undefined) days[i].count++
  }
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 28, right: 12, top: 10, bottom: 22 },
    xAxis: { type: 'category', data: days.map((d) => d.label), axisLabel: { fontSize: 9 } },
    yAxis: { type: 'value', minInterval: 1, axisLabel: { fontSize: 9 } },
    series: [
      {
        type: 'bar',
        data: days.map((d) => d.count),
        itemStyle: { color: '#20c997', borderRadius: [3, 3, 0, 0] },
        barWidth: '60%',
      },
    ],
  }
}

export function buildDueBarOption(activeMine: OverviewTask[], now: number): EChartsOption {
  const dayMs = 24 * 60 * 60 * 1000
  const buckets = { Telat: 0, 'Hari ini': 0, '1–3h': 0, '4–7h': 0, '>7h': 0, 'Tanpa deadline': 0 }
  for (const t of activeMine) {
    if (!t.dueAt) {
      buckets['Tanpa deadline']++
      continue
    }
    const diffDays = Math.ceil((new Date(t.dueAt).getTime() - now) / dayMs)
    if (diffDays < 0) buckets.Telat++
    else if (diffDays === 0) buckets['Hari ini']++
    else if (diffDays <= 3) buckets['1–3h']++
    else if (diffDays <= 7) buckets['4–7h']++
    else buckets['>7h']++
  }
  const labels = Object.keys(buckets)
  const palette = ['#fa5252', '#fd7e14', '#fab005', '#228be6', '#868e96', '#adb5bd']
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 90, right: 24, top: 10, bottom: 22 },
    xAxis: { type: 'value', minInterval: 1, axisLabel: { fontSize: 9 } },
    yAxis: { type: 'category', data: labels, axisLabel: { fontSize: 10 } },
    series: [
      {
        type: 'bar',
        data: labels.map((k, i) => ({
          value: buckets[k as keyof typeof buckets],
          itemStyle: { color: palette[i], borderRadius: [0, 3, 3, 0] },
        })),
        label: { show: true, position: 'right', fontSize: 10 },
        barWidth: '55%',
      },
    ],
  }
}
