import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { setSetting } from '../../src/lib/app-settings'
import { prisma } from '../../src/lib/db'
import {
  EXTENSION_KEYS,
  EXTENSION_META,
  getAllExtensions,
  invalidateExtensionCache,
  isExtensionEnabled,
  isExtensionEnabledFresh,
  isValidExtensionKey,
} from '../../src/lib/extensions'

async function reset() {
  await prisma.appSetting.deleteMany({ where: { key: { startsWith: 'extensions.' } } })
  invalidateExtensionCache()
}

beforeEach(reset)
afterEach(reset)

describe('extensions helper', () => {
  test('registry exposes github + chat', () => {
    expect(EXTENSION_KEYS).toContain('github')
    expect(EXTENSION_KEYS).toContain('chat')
    expect(EXTENSION_META.github.label).toBeTruthy()
    expect(EXTENSION_META.chat.label).toBeTruthy()
  })

  test('default = enabled saat tidak ada row di app_settings', async () => {
    const all = await getAllExtensions()
    expect(all.github).toBe(true)
    expect(all.chat).toBe(true)
    expect(await isExtensionEnabled('github')).toBe(true)
    expect(await isExtensionEnabled('chat')).toBe(true)
  })

  test('setSetting "false" → disabled, "true" → enabled', async () => {
    await setSetting('extensions.github.enabled', 'false')
    // setSetting harus invalidate cache via hook
    expect(await isExtensionEnabled('github')).toBe(false)
    expect(await isExtensionEnabled('chat')).toBe(true)

    await setSetting('extensions.github.enabled', 'true')
    expect(await isExtensionEnabled('github')).toBe(true)
  })

  test('isExtensionEnabledFresh bypass cache', async () => {
    await isExtensionEnabled('chat') // prime cache
    await prisma.appSetting.upsert({
      where: { key: 'extensions.chat.enabled' },
      update: { value: 'false' },
      create: { key: 'extensions.chat.enabled', value: 'false' },
    })
    // Fresh path reads DB langsung
    expect(await isExtensionEnabledFresh('chat')).toBe(false)
  })

  test('isValidExtensionKey type guard', () => {
    expect(isValidExtensionKey('github')).toBe(true)
    expect(isValidExtensionKey('chat')).toBe(true)
    expect(isValidExtensionKey('nope')).toBe(false)
    expect(isValidExtensionKey('')).toBe(false)
  })

  test('invalidateExtensionCache mempaksa load ulang', async () => {
    const before = await getAllExtensions()
    expect(before.github).toBe(true)
    // ubah DB di belakang punggung cache
    await prisma.appSetting.upsert({
      where: { key: 'extensions.github.enabled' },
      update: { value: 'false' },
      create: { key: 'extensions.github.enabled', value: 'false' },
    })
    invalidateExtensionCache()
    const after = await getAllExtensions()
    expect(after.github).toBe(false)
  })
})
