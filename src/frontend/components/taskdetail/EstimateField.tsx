import { NumberInput } from '@mantine/core'
import { useEffect, useState } from 'react'
import { TbClock } from 'react-icons/tb'

export function EstimateField({ value, onCommit }: { value: number | null; onCommit: (v: number | null) => void }) {
  const [local, setLocal] = useState<number | string>(value ?? '')
  useEffect(() => {
    setLocal(value ?? '')
  }, [value])

  return (
    <NumberInput
      label="Estimate (hours)"
      placeholder="e.g. 2.5"
      size="sm"
      min={0}
      step={0.5}
      decimalScale={2}
      leftSection={<TbClock size={14} />}
      value={local}
      onChange={setLocal}
      onBlur={() => {
        const committed = typeof local === 'number' ? local : null
        if (committed !== value) onCommit(committed)
      }}
    />
  )
}
