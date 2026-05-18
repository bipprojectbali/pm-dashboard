import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getVersionsSince, WHATS_NEW, type WhatsNewVersion } from '../lib/whats-new'

const LS_KEY = 'pm:last-seen-version'
export const WHATS_NEW_EVENT = 'pm:open-whats-new'

export function useWhatsNew() {
  const [open, setOpen] = useState(false)
  const [versions, setVersions] = useState<WhatsNewVersion[]>([])

  const { data } = useQuery<{ version: string }>({
    queryKey: ['api-version'],
    queryFn: () => fetch('/api/version').then((r) => r.json()),
    staleTime: Infinity,
    gcTime: Infinity,
  })

  const currentVersion = data?.version ?? null

  // Auto-show saat versi berubah
  useEffect(() => {
    if (!currentVersion) return
    const lastSeen = localStorage.getItem(LS_KEY)
    if (lastSeen === currentVersion) return
    const toShow = getVersionsSince(lastSeen)
    if (toShow.length === 0) return
    setVersions(toShow)
    setOpen(true)
  }, [currentVersion])

  // Manual trigger via DOM event (dari tombol di sidebar)
  useEffect(() => {
    const handler = () => {
      setVersions(WHATS_NEW.slice(0, 1))
      setOpen(true)
    }
    window.addEventListener(WHATS_NEW_EVENT, handler)
    return () => window.removeEventListener(WHATS_NEW_EVENT, handler)
  }, [])

  const dismiss = () => {
    if (currentVersion) localStorage.setItem(LS_KEY, currentVersion)
    setOpen(false)
  }

  return { open, versions, dismiss }
}
