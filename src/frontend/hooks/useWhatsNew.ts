import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { getRecentVersions, getVersionsSince, WHATS_NEW, type WhatsNewVersion } from '../lib/whats-new'

const LS_KEY = 'pm:last-seen-version'
export const WHATS_NEW_EVENT = 'pm:open-whats-new'
// Jumlah versi yang ditampilkan saat modal dibuka manual (ikon "Yang Baru" di
// sidebar) — supaya user bisa menelusuri riwayat pembaruan, bukan cuma versi
// terbaru. Dibatasi agar modal tidak terlalu panjang saat changelog membesar.
const MANUAL_HISTORY_LIMIT = 5

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
      setVersions(getRecentVersions(WHATS_NEW, MANUAL_HISTORY_LIMIT))
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
