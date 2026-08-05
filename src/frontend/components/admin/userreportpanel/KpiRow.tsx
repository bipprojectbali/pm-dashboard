import { SimpleGrid } from '@mantine/core'
import { TbAlarm, TbCircleCheck, TbLock, TbProgress } from 'react-icons/tb'
import { KpiCard } from '../overviewpanel/KpiCard'
import type { UserReportData } from './types'

export function KpiRow({ data, loading }: { data: UserReportData | undefined; loading: boolean }) {
  return (
    <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
      <KpiCard label="Total Task" value={data?.total ?? 0} icon={TbProgress} color="blue" loading={loading} />
      <KpiCard
        label="Overdue"
        value={data?.overdue ?? 0}
        sub={data?.blocked ? `${data.blocked} blocked` : undefined}
        subColor={data?.overdue ? 'red' : undefined}
        icon={TbAlarm}
        color="red"
        loading={loading}
      />
      <KpiCard label="Closed" value={data?.closed ?? 0} icon={TbCircleCheck} color="teal" loading={loading} />
      <KpiCard
        label="Blocked"
        value={data?.blocked ?? 0}
        icon={TbLock}
        color="orange"
        loading={loading}
        info="Task open milik user ini yang punya minimal satu dependency belum selesai."
      />
    </SimpleGrid>
  )
}
