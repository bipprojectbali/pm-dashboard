import { Card, Group, SimpleGrid, Text, ThemeIcon } from '@mantine/core'
import { TbCircleCheck, TbCircleX, TbLock, TbUser, TbUsers } from 'react-icons/tb'
import { InfoTip } from '@/frontend/components/shared/InfoTip'

export type AuditStats = {
  loginOk: number
  loginFail: number
  loginBlocked: number
  uniqueUsers: number
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  tip,
}: {
  label: string
  value: string
  icon: typeof TbUser
  color: string
  tip?: string
}) {
  return (
    <Card withBorder padding="lg" radius="md">
      <Group justify="space-between" align="flex-start">
        <div style={{ flex: 1 }}>
          <Group gap={4} wrap="nowrap">
            <Text size="xs" c="dimmed" fw={500} tt="uppercase">
              {label}
            </Text>
            {tip && <InfoTip label={tip} size={12} />}
          </Group>
          <Text fw={700} size="xl">
            {value}
          </Text>
        </div>
        <ThemeIcon variant="light" color={color} size="lg" radius="md">
          <Icon size={20} />
        </ThemeIcon>
      </Group>
    </Card>
  )
}

export function AuditStatCards({ stats }: { stats: AuditStats }) {
  return (
    <SimpleGrid cols={{ base: 2, md: 4 }} spacing="md">
      <StatCard
        label="Login Sukses · 24j"
        value={stats.loginOk.toString()}
        icon={TbCircleCheck}
        color="green"
        tip="Jumlah login sukses (action LOGIN) dalam 24 jam terakhir. Baseline aktivitas harian."
      />
      <StatCard
        label="Login Gagal · 24j"
        value={stats.loginFail.toString()}
        icon={TbCircleX}
        color="orange"
        tip="Jumlah login gagal (password salah atau email tidak ditemukan) dalam 24 jam. Lonjakan = indikasi brute-force."
      />
      <StatCard
        label="Diblokir · 24j"
        value={stats.loginBlocked.toString()}
        icon={TbLock}
        color="red"
        tip="Jumlah percobaan login dari akun yang sudah di-block. Jika tinggi, user mungkin masih butuh akses — pertimbangkan unblock."
      />
      <StatCard
        label="User Unik · 24j"
        value={stats.uniqueUsers.toString()}
        icon={TbUsers}
        color="blue"
        tip="Jumlah user distinct yang muncul di audit log 24 jam terakhir (semua action). Proxy untuk active users per hari."
      />
    </SimpleGrid>
  )
}
