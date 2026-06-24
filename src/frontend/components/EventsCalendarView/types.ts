export type EventUser = { id: string; name: string; email: string; image?: string | null }
export type EventTagItem = { tagId: string; tag: { id: string; name: string; color: string } }

export type TeamEvent = {
  id: string
  title: string
  description: string | null
  startsAt: string
  endsAt: string | null
  location: string | null
  projectId: string | null
  createdById: string | null
  createdAt: string
  updatedAt: string
  createdBy: EventUser | null
  project: { id: string; name: string } | null
  tags: EventTagItem[]
}
