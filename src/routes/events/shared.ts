export const eventInclude = {
  createdBy: { select: { id: true, name: true, email: true, image: true } },
  project: { select: { id: true, name: true } },
  tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
} as const
