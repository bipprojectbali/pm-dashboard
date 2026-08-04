import { z } from 'zod'
import {
  computeAdminOverview,
  computeProjectHealth,
  computeRiskReport,
  computeTaskTriage,
  computeTeamLoad,
} from '../../../src/lib/admin-overview'
import { computeRetro, renderRetroMarkdown } from '../../../src/lib/retro'
import { computeTaskDashboardCharts } from '../../../src/lib/task-dashboard-charts'
import { computeTaskDashboardStats } from '../../../src/lib/task-dashboard-stats'
import { jsonText, type ToolModule } from './shared'

export const overviewReadonly: ToolModule = {
  name: 'overview-readonly',
  scope: 'readonly',
  register(server) {
    server.registerTool(
      'admin_overview',
      {
        title: 'Admin overview KPIs',
        description:
          'Aggregated KPIs across users, projects, tasks, agents, webhooks, recent audit. Mirrors /admin Overview panel.',
        inputSchema: {
          recentAuditLimit: z.number().int().min(0).max(50).default(8),
        },
      },
      async ({ recentAuditLimit }) => jsonText(await computeAdminOverview({ recentAuditLimit })),
    )

    server.registerTool(
      'project_health',
      {
        title: 'Project health report',
        description:
          'Per-project health: overdue, blocked, velocity (closed/7d), extensions, days-until-due, score A-F. Filter by status or id.',
        inputSchema: {
          projectId: z.string().optional().describe('Single project id; omit for all active'),
          includeArchived: z.boolean().default(false),
          limit: z.number().int().min(1).max(200).default(50),
        },
      },
      async ({ projectId, includeArchived, limit }) =>
        jsonText(await computeProjectHealth({ projectId, includeArchived, limit })),
    )

    server.registerTool(
      'team_load',
      {
        title: 'Team load report',
        description:
          'Per-user workload: open tasks, estimated hours, overdue, closed/7d. Sorted by open-task count desc. Flags overloaded users.',
        inputSchema: {
          projectId: z.string().optional().describe('Filter to one project; omit for all'),
          includeUnassigned: z.boolean().default(true),
          limit: z.number().int().min(1).max(200).default(50),
        },
      },
      async ({ projectId, includeUnassigned, limit }) =>
        jsonText(await computeTeamLoad({ projectId, includeUnassigned, limit })),
    )

    server.registerTool(
      'risk_report',
      {
        title: 'Consolidated risk report',
        description:
          'Scans for risk signals: overdue tasks, stale IN_PROGRESS (>3d no update), projects past endsAt, missing required env.',
        inputSchema: {
          staleDays: z.number().int().min(1).max(30).default(3),
        },
      },
      async ({ staleDays }) =>
        jsonText(await computeRiskReport({ staleDays })),
    )

    server.registerTool(
      'task_triage',
      {
        title: 'Task triage counts',
        description:
          'Counts backing the Admin Task Triage cards: open (non-CLOSED), overdue, unassigned, blocked, stale (>staleDays no update). Excludes IDEA; computed in-DB (not capped). Filter by project.',
        inputSchema: {
          projectId: z.string().optional().describe('Filter to one project; omit for all'),
          staleDays: z.number().int().min(1).max(30).default(7),
        },
      },
      async ({ projectId, staleDays }) =>
        jsonText(await computeTaskTriage({ projectId, staleDays })),
    )

    server.registerTool(
      'task_dashboard_stats',
      {
        title: 'Task panel dashboard stats',
        description:
          'Total/Open/Closed/Overdue counts backing the Tasks panel dashboard overlay (both /pm global board and a project Tasks tab). Computed in-DB (not capped at 200 like the underlying task list) — includes every kind (IDEA not excluded, unlike task_triage). Filter by project.',
        inputSchema: {
          projectId: z.string().optional().describe('Filter to one project; omit for all'),
        },
      },
      async ({ projectId }) =>
        jsonText(await computeTaskDashboardStats({ userId: '', isAdmin: true, projectId })),
    )

    server.registerTool(
      'task_dashboard_charts',
      {
        title: 'Task panel dashboard charts',
        description:
          'Throughput (created/closed per day), status breakdown, and top-8 assignees (open tasks) backing the Tasks panel dashboard overlay charts. Computed in-DB (not capped at 200 like the underlying task list); includes every kind (IDEA not excluded), matching task_dashboard_stats. Filter by project; trendDays clamps 1-90 (default 14).',
        inputSchema: {
          projectId: z.string().optional().describe('Filter to one project; omit for all'),
          trendDays: z.number().int().min(1).max(90).optional(),
        },
      },
      async ({ projectId, trendDays }) =>
        jsonText(await computeTaskDashboardCharts({ userId: '', isAdmin: true, projectId, trendDays })),
    )

    server.registerTool(
      'project_retro',
      {
        title: 'Automated retrospective',
        description:
          'Generate a retrospective for a project over a time window. Joins closed/slipped/blocked tasks + extensions + GitHub activity + top contributors. Returns markdown by default (paste-ready for docs/standup).',
        inputSchema: {
          projectId: z.string(),
          days: z.number().int().min(1).max(180).default(14).describe('Window length in days ending now'),
          since: z.string().optional().describe('ISO timestamp; overrides days if provided'),
          until: z.string().optional().describe('ISO timestamp; defaults to now'),
          format: z.enum(['markdown', 'json']).default('markdown'),
        },
      },
      async ({ projectId, days, since, until, format }) => {
        const now = new Date()
        const untilDate = until ? new Date(until) : now
        const sinceDate = since
          ? new Date(since)
          : new Date(untilDate.getTime() - days * 24 * 60 * 60 * 1000)
        if (Number.isNaN(sinceDate.getTime()) || Number.isNaN(untilDate.getTime()) || untilDate <= sinceDate) {
          return jsonText({ error: 'Invalid since/until' })
        }
        const retro = await computeRetro({ projectId, since: sinceDate, until: untilDate })
        if (!retro) return jsonText({ error: 'Project not found' })
        if (format === 'markdown') return jsonText(renderRetroMarkdown(retro))
        return jsonText(retro)
      },
    )
  },
}
