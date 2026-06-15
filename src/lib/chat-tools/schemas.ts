import type { AnthropicTool } from './types'

export const CHAT_TOOLS: AnthropicTool[] = [
  {
    name: 'query_users',
    description:
      'Cari & filter user (anggota tim). Pakai untuk pertanyaan tentang siapa, apa role-nya, berapa task open-nya. ' +
      'Hasil maksimal 50 baris. WAJIB dipakai untuk pertanyaan numerik tentang user, jangan tebak dari konteks.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Substring nama atau email (case-insensitive). Kosongkan untuk semua user.' },
        role: { type: 'string', enum: ['USER', 'QC', 'ADMIN', 'SUPER_ADMIN'], description: 'Filter role.' },
        includeBlocked: { type: 'boolean', description: 'Default false.' },
        limit: { type: 'number', description: '1-50, default 20.' },
      },
    },
  },
  {
    name: 'query_tasks',
    description:
      'Cari, filter, agregasi task. Mendukung COUNT/SUM via mode="aggregate". Mode="list" return detail task. ' +
      'Pakai untuk: "berapa task X", "total estimasi jam Y", "list task HIGH di proyek Z". Hasil maksimal 50 baris.',
    input_schema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['list', 'aggregate'], description: 'list = detail rows; aggregate = count + sumEstimateHours + groupBy.' },
        projectId: { type: 'string' },
        projectName: { type: 'string', description: 'Nama persis atau substring proyek (kalau projectId tidak tahu).' },
        assigneeEmail: { type: 'string' },
        assigneeName: { type: 'string' },
        status: { type: 'array', items: { type: 'string', enum: ['OPEN', 'IN_PROGRESS', 'READY_FOR_QC', 'REOPENED', 'CLOSED'] } },
        priority: { type: 'array', items: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] } },
        kind: { type: 'array', items: { type: 'string', enum: ['TASK', 'BUG', 'QC'] } },
        overdueOnly: { type: 'boolean', description: 'Hanya task lewat dueAt & belum CLOSED.' },
        createdSinceDays: { type: 'number', description: 'Hanya task createdAt dalam N hari terakhir.' },
        closedSinceDays: { type: 'number', description: 'Hanya task closedAt dalam N hari terakhir.' },
        groupBy: { type: 'string', enum: ['status', 'priority', 'kind', 'assignee', 'project'], description: 'Hanya untuk mode=aggregate.' },
        limit: { type: 'number', description: '1-50, default 20.' },
      },
      required: ['mode'],
    },
  },
  {
    name: 'query_project_detail',
    description:
      'Ambil detail lengkap proyek (members, milestones aktif & lewat, extensions, KPI task). ' +
      'Pakai untuk pertanyaan deep tentang satu proyek.',
    input_schema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        projectName: { type: 'string', description: 'Substring nama (kalau id tidak tahu).' },
      },
    },
  },
  {
    name: 'query_github_activity',
    description:
      'Aktivitas GitHub: commits + PR + kontributor untuk proyek (dengan repo terlink) atau actor login. ' +
      'Window maks 90 hari. Pakai untuk "siapa commit terbanyak", "berapa PR open di X".',
    input_schema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        projectName: { type: 'string' },
        actorLogin: { type: 'string', description: 'GitHub username untuk filter cross-project.' },
        sinceDays: { type: 'number', description: 'Window N hari terakhir, default 7, maks 90.' },
        limit: { type: 'number', description: '1-50, default 20.' },
      },
    },
  },
  {
    name: 'query_effort',
    description:
      'Effort tracking dari pm-watch ActivityWatch: mode=task (detail satu task), mode=user (phantom work per user — ' +
      'aktivitas yang tidak terlacak ke task), mode=overbudget (task yang melebihi/di bawah estimasi). ' +
      'Pakai untuk: "siapa paling banyak phantom work", "task mana yang overbudget", "berapa actual hours task X".',
    input_schema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['task', 'user', 'overbudget'], description: 'Mode query effort.' },
        taskId: { type: 'string', description: 'Wajib untuk mode=task.' },
        verdict: {
          type: 'string',
          enum: ['over', 'under', 'on', 'missing-estimate', 'no-assignee', 'no-activity'],
          description: 'Filter verdict untuk mode=overbudget. Default "over".',
        },
        sinceDays: { type: 'number', description: 'Window hari untuk mode=user. Default 7.' },
        limit: { type: 'number', description: '1-50, default 20.' },
      },
      required: ['mode'],
    },
  },
]
