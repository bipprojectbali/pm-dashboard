import { Badge } from '@mantine/core'

export function TabCount({ value, color = 'gray' }: { value: string | number; color?: string }) {
  return (
    <Badge size="xs" variant="light" color={color} circle>
      {value}
    </Badge>
  )
}
