import { Elysia } from 'elysia'
import { qcActionRoutes } from './qc/actions.route'
import { qcBulkRoutes } from './qc/bulk.route'
import { qcQueryRoutes } from './qc/query.route'
import { qcWriteRoutes } from './qc/write.route'

export function qcRoutes() {
  return new Elysia()
    .use(qcQueryRoutes())
    .use(qcBulkRoutes())
    .use(qcWriteRoutes())
    .use(qcActionRoutes())
}
