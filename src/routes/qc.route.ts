import { Elysia } from 'elysia'
import { qcActionRoutes } from './qc/actions.route'
import { qcBulkRoutes } from './qc/bulk.route'
import { qcDetailRoutes } from './qc/detail.route'
import { qcEvidenceRoutes } from './qc/evidence.route'
import { qcQueryRoutes } from './qc/query.route'
import { qcUpdateRoutes } from './qc/update.route'
import { qcWriteRoutes } from './qc/write.route'

export function qcRoutes() {
  return new Elysia()
    .use(qcQueryRoutes())
    .use(qcDetailRoutes())
    .use(qcBulkRoutes())
    .use(qcWriteRoutes())
    .use(qcUpdateRoutes())
    .use(qcActionRoutes())
    .use(qcEvidenceRoutes())
}
