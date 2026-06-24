import Elysia from 'elysia'
import {
  createMilestoneHandler,
  deleteMilestoneHandler,
  listAllMilestonesHandler,
  listProjectMilestonesHandler,
  updateMilestoneHandler,
} from './milestones.handlers'

export function milestoneRoutes() {
  return new Elysia()
    .get('/api/milestones', listAllMilestonesHandler)
    .get('/api/projects/:id/milestones', listProjectMilestonesHandler)
    .post('/api/projects/:id/milestones', createMilestoneHandler)
    .patch('/api/milestones/:id', updateMilestoneHandler)
    .delete('/api/milestones/:id', deleteMilestoneHandler)
}
