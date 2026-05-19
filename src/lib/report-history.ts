import { redis } from './redis'

export type SendTrigger = 'cron' | 'manual' | 'custom'

export interface SendHistoryEntry {
  sentAt: string
  ok: boolean
  message: string
  trigger: SendTrigger
}

const KEY = 'report:send-history'
const MAX = 20

export async function recordSendHistory(entry: SendHistoryEntry): Promise<void> {
  await redis.lpush(KEY, JSON.stringify(entry))
  await redis.ltrim(KEY, 0, MAX - 1)
}

export async function getSendHistory(): Promise<SendHistoryEntry[]> {
  const raw = await redis.lrange(KEY, 0, MAX - 1)
  return (raw as string[]).map((s) => JSON.parse(s) as SendHistoryEntry)
}
