import { redirect } from 'next/navigation'
import { AppWelcome } from '@/components/app/app-welcome'
import { getLearnerServerSession } from '@/lib/learnerServerSession'
import { buildNoIndexMetadata } from '@/lib/seo'

export const metadata = buildNoIndexMetadata('Welcome', 'Start learning African languages with Kela.')

// The app's first screen. Signed-in learners go straight to their dashboard.
export default async function WelcomePage() {
  const session = await getLearnerServerSession()
  if (session) redirect('/dashboard')
  return <AppWelcome />
}
