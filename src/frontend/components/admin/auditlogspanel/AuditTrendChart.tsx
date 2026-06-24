import { Card, Group, Stack, Text } from '@mantine/core'
import type { EChartsOption } from 'echarts'
import { useMemo } from 'react'
import { EChart } from '@/frontend/components/charts/EChart'
import { InfoTip } from '@/frontend/components/shared/InfoTip'
import { toLocalDateStr } from '@/frontend/lib/dates'
import type { AuditLogEntry } from './types'

export function AuditTrendChart({ logs }: { logs: AuditLogEntry[] }) {
  const trendOption = useMemo<EChartsOption>(() => {
    const days: Array<{ key: string; label: string; ok: number; fail: number; blocked: number }> = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date()
      d.setHours(0, 0, 0, 0)
      d.setDate(d.getDate() - i)
      days.push({ key: toLocalDateStr(d), label: toLocalDateStr(d).slice(5), ok: 0, fail: 0, blocked: 0 })
    }
    const index = new Map(days.map((d, i) => [d.key, i]))
    for (const l of logs) {
      const d = new Date(l.createdAt)
      d.setHours(0, 0, 0, 0)
      const i = index.get(toLocalDateStr(d))
      if (i === undefined) continue
      if (l.action === 'LOGIN') days[i].ok++
      else if (l.action === 'LOGIN_FAILED') days[i].fail++
      else if (l.action === 'LOGIN_BLOCKED') days[i].blocked++
    }
    return {
      tooltip: { trigger: 'axis' },
      legend: { data: ['Sukses', 'Gagal', 'Diblokir'], top: 0, itemWidth: 10, itemHeight: 10 },
      grid: { left: 32, right: 12, top: 28, bottom: 24 },
      xAxis: { type: 'category', data: days.map((d) => d.label), axisLabel: { fontSize: 9 } },
      yAxis: { type: 'value', minInterval: 1, axisLabel: { fontSize: 9 } },
      series: [
        {
          name: 'Sukses',
          type: 'line',
          smooth: true,
          data: days.map((d) => d.ok),
          itemStyle: { color: '#40c057' },
          areaStyle: { opacity: 0.1 },
        },
        {
          name: 'Gagal',
          type: 'line',
          smooth: true,
          data: days.map((d) => d.fail),
          itemStyle: { color: '#fd7e14' },
          areaStyle: { opacity: 0.1 },
        },
        {
          name: 'Diblokir',
          type: 'line',
          smooth: true,
          data: days.map((d) => d.blocked),
          itemStyle: { color: '#fa5252' },
          areaStyle: { opacity: 0.1 },
        },
      ],
    }
  }, [logs])

  return (
    <Card withBorder padding="md" radius="md">
      <Group gap={4} mb="xs">
        <Stack gap={4} style={{ flex: 1 }}>
          <Text fw={600} size="sm">
            Tren Login 14 Hari
          </Text>
          <Text size="xs" c="dimmed">
            Sukses vs gagal vs diblokir per hari
          </Text>
        </Stack>
        <InfoTip
          width={340}
          label="Grafik 14 hari terakhir: hijau = login sukses, oranye = gagal (credential salah), merah = diblokir. Pola oranye + merah meningkat tajam = kemungkinan serangan bruteforce."
        />
      </Group>
      <EChart option={trendOption} height={180} />
    </Card>
  )
}
