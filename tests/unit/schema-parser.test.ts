/**
 * Tests for the Prisma schema parser that powers the Dev Console "Database"
 * ER diagram (GET /api/admin/schema).
 *
 * Regression focus: named relations. The relation regex originally required
 * `@relation(fields: [...])` with no leading name, so every
 * `@relation("Name", fields: [...])` was silently dropped — 14 of 41 edges in
 * the real schema, including all User FKs and the Task dependency self-links.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'
import { parseSchema } from '../../src/lib/schema-parser'

describe('parseSchema — relations', () => {
  test('captures a plain (unnamed) FK relation', () => {
    const schema = `
      model Post {
        id       String @id
        authorId String
        author   User   @relation(fields: [authorId], references: [id], onDelete: Cascade)
      }
    `
    const { relations } = parseSchema(schema)
    expect(relations).toHaveLength(1)
    expect(relations[0]).toMatchObject({
      from: 'Post',
      fromField: 'authorId',
      to: 'User',
      toField: 'id',
      onDelete: 'Cascade',
    })
  })

  test('captures a NAMED FK relation (the regression)', () => {
    const schema = `
      model Task {
        id         String @id
        reporterId String
        reporter   User   @relation("TaskReporter", fields: [reporterId], references: [id], onDelete: Restrict)
      }
    `
    const { relations } = parseSchema(schema)
    expect(relations).toHaveLength(1)
    expect(relations[0]).toMatchObject({
      from: 'Task',
      fromField: 'reporterId',
      to: 'User',
      toField: 'id',
      onDelete: 'Restrict',
    })
  })

  test('captures a named relation without onDelete (onDelete stays undefined)', () => {
    const schema = `
      model Comment {
        id       String @id
        authorId String?
        author   User?  @relation("CommentAuthor", fields: [authorId], references: [id])
      }
    `
    const { relations } = parseSchema(schema)
    expect(relations).toHaveLength(1)
    expect(relations[0].to).toBe('User')
    expect(relations[0].onDelete).toBeUndefined()
  })

  test('captures both sides of a self-referential dependency (named relations)', () => {
    const schema = `
      model TaskDependency {
        id          String @id
        taskId      String
        blockedById String
        task        Task   @relation("TaskDependents", fields: [taskId], references: [id], onDelete: Cascade)
        blockedBy   Task   @relation("TaskBlockers", fields: [blockedById], references: [id], onDelete: Cascade)
      }
    `
    const { relations } = parseSchema(schema)
    expect(relations).toHaveLength(2)
    expect(relations.map((r) => r.fromField).sort()).toEqual(['blockedById', 'taskId'])
    expect(relations.every((r) => r.to === 'Task')).toBe(true)
  })
})

describe('parseSchema — models, enums, fields', () => {
  test('parses @@map custom table name', () => {
    const schema = `
      model AuditLog {
        id String @id
        @@map("audit_log")
      }
    `
    const { models } = parseSchema(schema)
    expect(models[0].name).toBe('AuditLog')
    expect(models[0].tableName).toBe('audit_log')
  })

  test('parses field attributes: id, unique, optional, list, default', () => {
    const schema = `
      model User {
        id    String @id @default(cuid())
        email String @unique
        name  String?
        tags  Tag[]
      }
    `
    const { models } = parseSchema(schema)
    const f = Object.fromEntries(models[0].fields.map((x) => [x.name, x]))
    expect(f.id.isId).toBe(true)
    expect(f.id.default).toBe('cuid()')
    expect(f.email.isUnique).toBe(true)
    expect(f.name.isOptional).toBe(true)
    expect(f.tags.isList).toBe(true)
  })

  test('function-call defaults keep their parens (uuid()/now()/cuid(), not truncated)', () => {
    const schema = `
      model Row {
        id        String   @id @default(uuid())
        createdAt DateTime @default(now())
        status    String   @default("blue")
        active    Boolean  @default(false)
      }
    `
    const { models } = parseSchema(schema)
    const f = Object.fromEntries(models[0].fields.map((x) => [x.name, x]))
    expect(f.id.default).toBe('uuid()')
    expect(f.createdAt.default).toBe('now()')
    expect(f.status.default).toBe('"blue"')
    expect(f.active.default).toBe('false')
  })

  test('parses enums with clean values (no attribute/blank lines)', () => {
    const schema = `
      enum Role {
        USER
        ADMIN
        SUPER_ADMIN
      }
    `
    const { enums } = parseSchema(schema)
    expect(enums).toHaveLength(1)
    expect(enums[0].values).toEqual(['USER', 'ADMIN', 'SUPER_ADMIN'])
  })

  test('scalar fields are not mistaken for relations; model refs are', () => {
    const schema = `
      model Task {
        id        String   @id
        createdAt DateTime @default(now())
        projectId String
        project   Project  @relation(fields: [projectId], references: [id])
      }
    `
    const { models } = parseSchema(schema)
    const f = Object.fromEntries(models[0].fields.map((x) => [x.name, x]))
    expect(f.id.isRelation).toBe(false)
    expect(f.createdAt.isRelation).toBe(false)
    expect(f.project.isRelation).toBe(true)
  })
})

describe('parseSchema — real project schema guard', () => {
  const raw = readFileSync(join(import.meta.dir, '..', '..', 'prisma', 'schema.prisma'), 'utf-8')
  const parsed = parseSchema(raw)

  test('every FK @relation(fields:) in the file becomes an edge', () => {
    // Ground truth: count FK-defining relation attributes in the raw schema.
    const fkCount = (raw.match(/@relation\([^)]*fields:\s*\[/g) ?? []).length
    expect(parsed.relations.length).toBe(fkCount)
  })

  test('model & enum counts match the raw block counts', () => {
    const rawModels = (raw.match(/^\s*model\s+\w+\s*\{/gm) ?? []).length
    const rawEnums = (raw.match(/^\s*enum\s+\w+\s*\{/gm) ?? []).length
    expect(parsed.models.length).toBe(rawModels)
    expect(parsed.enums.length).toBe(rawEnums)
  })
})
