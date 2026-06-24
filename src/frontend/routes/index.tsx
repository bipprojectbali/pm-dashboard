import { Box } from '@mantine/core'
import { useMantineColorScheme } from '@mantine/core'
import { createFileRoute } from '@tanstack/react-router'
import { useSession } from '@/frontend/hooks/useAuth'
import type { LandingUser } from './home/data'
import { CtaBanner } from './home/CtaBanner'
import { FeaturesSection } from './home/FeaturesSection'
import { HeroSection } from './home/HeroSection'
import { LandingFooter } from './home/LandingFooter'
import { LandingNavbar } from './home/LandingNavbar'
import { TechStackSection } from './home/TechStackSection'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  const { data } = useSession()
  const user = data?.user as LandingUser
  const { colorScheme } = useMantineColorScheme()
  const isDark = colorScheme === 'dark'

  return (
    <Box
      mih="100dvh"
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: isDark ? '#0d0e12' : '#f4f5f8',
      }}
    >
      <LandingNavbar isDark={isDark} user={user} />
      <HeroSection isDark={isDark} user={user} />
      <FeaturesSection isDark={isDark} />
      <TechStackSection />
      <CtaBanner isDark={isDark} user={user} />
      <LandingFooter />
    </Box>
  )
}
