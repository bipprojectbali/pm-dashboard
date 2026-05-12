import { prisma } from './db'

export async function getSetting(key: string): Promise<string | null> {
  const row = await prisma.appSetting.findUnique({ where: { key } })
  return row?.value ?? null
}

export async function setSetting(key: string, value: string, userId?: string): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key },
    update: { value, updatedBy: userId },
    create: { key, value, updatedBy: userId },
  })
}

export async function getSettings(keys: string[]): Promise<Record<string, string>> {
  const rows = await prisma.appSetting.findMany({ where: { key: { in: keys } } })
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const rows = await prisma.appSetting.findMany()
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}
