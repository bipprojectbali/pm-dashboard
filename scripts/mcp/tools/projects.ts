import { type ToolModule } from './shared'
import { projectsReadonly } from './projects.readonly'
import { registerProjectWriteTools } from './projects.write'
import { registerProjectScaffold } from './projects.scaffold'

export { projectsReadonly }

export const projectsTools: ToolModule = {
  name: 'projects',
  scope: 'admin',
  register(server) {
    registerProjectWriteTools(server)
    registerProjectScaffold(server)
  },
}
