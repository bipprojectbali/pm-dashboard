import type { ToolModule } from './shared'
import { registerQcSelfProjectWriteTools } from './qc.self-project.write'
import { registerQcTicketCreateTool } from './qc.ticket-create.write'
import { registerQcTicketStatusTools } from './qc.ticket-status.write'
import { registerQcTicketActionTools } from './qc.ticket-actions.write'

export const qcTools: ToolModule = {
  name: 'qc',
  scope: 'admin',
  register(server) {
    registerQcSelfProjectWriteTools(server)
    registerQcTicketCreateTool(server)
    registerQcTicketStatusTools(server)
    registerQcTicketActionTools(server)
  },
}
