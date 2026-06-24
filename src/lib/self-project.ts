import { prisma } from './db'

export const AI_QUEUE_TAG = 'ai-queue'

export async function getSelfProject() {
  return prisma.project.findFirst({
    where: { isSelf: true },
    select: {
      id: true,
      name: true,
      description: true,
      githubRepo: true,
      status: true,
      visibility: true,
    },
  })
}

export async function setSelfProject(projectId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.project.updateMany({ where: { isSelf: true, NOT: { id: projectId } }, data: { isSelf: false } })
    const project = await tx.project.update({
      where: { id: projectId },
      data: { isSelf: true },
      select: { id: true, name: true },
    })
    await tx.tag.upsert({
      where: { projectId_name: { projectId, name: AI_QUEUE_TAG } },
      update: {},
      create: { projectId, name: AI_QUEUE_TAG, color: 'red' },
    })
    return project
  })
}

export async function clearSelfProject() {
  return prisma.project.updateMany({ where: { isSelf: true }, data: { isSelf: false } })
}

export async function ensureAiQueueTag(projectId: string) {
  return prisma.tag.upsert({
    where: { projectId_name: { projectId, name: AI_QUEUE_TAG } },
    update: {},
    create: { projectId, name: AI_QUEUE_TAG, color: 'red' },
    select: { id: true, name: true },
  })
}
