import { prisma } from './db'

/**
 * Cek apakah judul fase sudah dipakai di project yang sama (case-insensitive, trim).
 * Sumber kebenaran untuk keunikan nama fase — dipakai HTTP handler & MCP tool.
 * `excludePhaseId` dilewatkan saat rename agar fase tak bentrok dengan dirinya sendiri.
 */
export async function isPhaseNameTaken(projectId: string, title: string, excludePhaseId?: string): Promise<boolean> {
  const dup = await prisma.projectPhase.findFirst({
    where: {
      projectId,
      title: { equals: title.trim(), mode: 'insensitive' },
      ...(excludePhaseId ? { NOT: { id: excludePhaseId } } : {}),
    },
    select: { id: true },
  })
  return dup !== null
}

export function phaseNameTakenError(title: string): string {
  return `Nama fase "${title.trim()}" sudah dipakai di project ini`
}
