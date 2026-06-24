import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import { CommandPalette } from '@/frontend/components/CommandPalette'
import { ErrorPage } from '@/frontend/components/ErrorPage'
import { GlobalTaskModal } from '@/frontend/components/GlobalTaskModal'
import { NotFound } from '@/frontend/components/NotFound'
import { SessionGuard } from '@/frontend/components/SessionGuard'
import { WhatsNewModal } from '@/frontend/components/WhatsNewModal'
import { useWhatsNew } from '@/frontend/hooks/useWhatsNew'

interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: NotFound,
  errorComponent: ({ error }) => <ErrorPage error={error} />,
})

function RootLayout() {
  const { open, versions, dismiss } = useWhatsNew()
  return (
    <>
      <SessionGuard />
      <Outlet />
      <GlobalTaskModal />
      <CommandPalette />
      <WhatsNewModal opened={open} versions={versions} onClose={dismiss} />
    </>
  )
}
