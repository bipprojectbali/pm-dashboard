import { prisma } from '../db'
import { computeRetro, renderRetroMarkdown } from '../retro'
import { type SyncCtx, upsertDoc } from './upsert'

export async function syncProjectRetro(ctx: SyncCtx): Promise<void> {
  const { embSettings, counters } = ctx
  const since14d = new Date(Date.now() - 14 * 86_400_000)
  const activeProjects = await prisma.project.findMany({
    where: { archivedAt: null, status: { notIn: ['CANCELLED', 'COMPLETED'] } },
    select: { id: true, name: true },
    take: 50,
  })
  // Sequential batch of 5 to avoid hammering DB.
  for (let i = 0; i < activeProjects.length; i += 5) {
    const batch = activeProjects.slice(i, i + 5)
    await Promise.all(
      batch.map(async (p) => {
        try {
          const retro = await computeRetro({ projectId: p.id, since: since14d })
          if (!retro) return
          const md = renderRetroMarkdown(retro).slice(0, 3000)
          await upsertDoc(
            {
              type: 'project_retro',
              entityId: p.id,
              title: `Retro 14h: ${p.name}`,
              content: md,
              tags: 'retro',
              projectId: p.id,
            },
            embSettings,
            counters,
          )
        } catch {
          /* skip failed retro */
        }
      }),
    )
  }
}
