import Elysia from 'elysia'
import { projectAccessTokenRoutes } from './projects/access-tokens.route'
import { projectDocumentRoutes } from './projects/documents.route'
import { projectExtensionRoutes } from './projects/extensions.route'
import { projectGithubRoutes } from './projects/github.route'
import { projectLockRoutes } from './projects/lock.route'
import { projectMemberRoutes } from './projects/members.route'
import { milestoneRoutes } from './projects/milestones.route'
import { projectQueryRoutes } from './projects/query.route'
import { projectWriteRoutes } from './projects/write.route'

export function projectsRoutes() {
  return new Elysia()
    .use(projectQueryRoutes())
    .use(projectWriteRoutes())
    .use(projectMemberRoutes())
    .use(projectExtensionRoutes())
    .use(projectLockRoutes())
    .use(milestoneRoutes())
    .use(projectGithubRoutes())
    .use(projectAccessTokenRoutes())
    .use(projectDocumentRoutes())
}
