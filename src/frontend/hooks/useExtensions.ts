import { useQuery } from '@tanstack/react-query'

export type ExtensionKey = 'github' | 'chat'

interface StatusResponse {
  enabled: Record<ExtensionKey, boolean>
}

async function fetchStatus(): Promise<StatusResponse> {
  const res = await fetch('/api/extensions/status', { credentials: 'include' })
  if (!res.ok) throw new Error(`status ${res.status}`)
  return res.json()
}

export function useExtensionsStatus() {
  return useQuery({
    queryKey: ['extensions', 'status'],
    queryFn: fetchStatus,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })
}

export function useIsExtensionEnabled(key: ExtensionKey): boolean {
  const { data } = useExtensionsStatus()
  // Default ke true sampai data datang — supaya UI tidak flicker hilang dulu lalu muncul.
  return data?.enabled?.[key] ?? true
}
