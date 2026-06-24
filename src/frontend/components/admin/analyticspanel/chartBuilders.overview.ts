import type { EChartsOption } from 'echarts'
import type { OverviewAnalytics } from './types'

export function buildTrendOption(taskTrend: OverviewAnalytics['taskTrend']): EChartsOption {
  return {
    tooltip: { trigger: 'axis' },
    legend: { data: ['Dibuka', 'Ditutup'], top: 0 },
    grid: { left: 40, right: 16, top: 32, bottom: 28 },
    xAxis: {
      type: 'category',
      data: taskTrend.map((t) => t.date.slice(5)),
      axisLabel: { fontSize: 10 },
    },
    yAxis: { type: 'value', minInterval: 1 },
    series: [
      {
        name: 'Dibuka',
        type: 'line',
        smooth: true,
        data: taskTrend.map((t) => t.created),
        itemStyle: { color: '#228be6' },
        areaStyle: { opacity: 0.15 },
      },
      {
        name: 'Ditutup',
        type: 'line',
        smooth: true,
        data: taskTrend.map((t) => t.closed),
        itemStyle: { color: '#40c057' },
        areaStyle: { opacity: 0.15 },
      },
    ],
  }
}

export function buildStatusOption(tasksByStatus: Record<string, number>): EChartsOption {
  return {
    tooltip: { trigger: 'item' },
    legend: { bottom: 0, itemWidth: 10, itemHeight: 10, textStyle: { fontSize: 11 } },
    series: [
      {
        type: 'pie',
        radius: ['45%', '70%'],
        center: ['50%', '45%'],
        avoidLabelOverlap: true,
        label: { show: false },
        data: [
          { name: 'Open', value: tasksByStatus.OPEN ?? 0, itemStyle: { color: '#228be6' } },
          { name: 'In Progress', value: tasksByStatus.IN_PROGRESS ?? 0, itemStyle: { color: '#7950f2' } },
          { name: 'Ready for QC', value: tasksByStatus.READY_FOR_QC ?? 0, itemStyle: { color: '#fab005' } },
          { name: 'Reopened', value: tasksByStatus.REOPENED ?? 0, itemStyle: { color: '#fd7e14' } },
          { name: 'Closed', value: tasksByStatus.CLOSED ?? 0, itemStyle: { color: '#40c057' } },
        ],
      },
    ],
  }
}

export function buildHeatmapOption(taskTrend: OverviewAnalytics['taskTrend']): EChartsOption {
  if (taskTrend.length === 0) return { series: [] }
  const first = new Date(taskTrend[0].date)
  const firstDow = first.getDay()
  const weeks: Array<Array<{ date: string; closed: number } | null>> = []
  let week: Array<{ date: string; closed: number } | null> = new Array(firstDow).fill(null)
  for (const t of taskTrend) {
    week.push({ date: t.date, closed: t.closed })
    if (week.length === 7) {
      weeks.push(week)
      week = []
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null)
    weeks.push(week)
  }
  const data: Array<[number, number, number]> = []
  let max = 0
  const cellDate = new Map<string, string>()
  for (let wi = 0; wi < weeks.length; wi++) {
    const w = weeks[wi]
    for (let di = 0; di < w.length; di++) {
      const cell = w[di]
      if (!cell) continue
      data.push([wi, 6 - di, cell.closed])
      if (cell.closed > max) max = cell.closed
      cellDate.set(`${wi},${6 - di}`, cell.date)
    }
  }
  const dayLabels = ['Min', 'Sab', 'Jum', 'Kam', 'Rab', 'Sel', 'Sen']
  return {
    tooltip: {
      formatter: (params: unknown) => {
        const p = params as { data: [number, number, number] }
        const date = cellDate.get(`${p.data[0]},${p.data[1]}`) ?? ''
        return `${date}<br/><b>${p.data[2]}</b> task ditutup`
      },
    },
    grid: { left: 40, right: 16, top: 16, bottom: 24 },
    xAxis: {
      type: 'category',
      data: weeks.map((_, i) => `W${i + 1}`),
      splitArea: { show: true },
      axisLabel: { fontSize: 9 },
    },
    yAxis: {
      type: 'category',
      data: dayLabels,
      splitArea: { show: true },
      axisLabel: { fontSize: 10 },
    },
    visualMap: {
      min: 0,
      max: Math.max(1, max),
      calculable: false,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      show: false,
      inRange: { color: ['#e9ecef', '#74c0fc', '#228be6', '#1864ab'] },
    },
    series: [
      {
        type: 'heatmap',
        data,
        label: { show: false },
        itemStyle: { borderRadius: 2, borderWidth: 1, borderColor: 'var(--mantine-color-body)' },
      },
    ],
  }
}
