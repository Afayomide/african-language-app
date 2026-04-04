import type { ReactNode } from 'react'
import { LearnerAuthShell } from '@/components/auth/learner-auth-shell'
import { buildNoIndexMetadata } from '@/lib/seo'

export const metadata = buildNoIndexMetadata('Lesson Overview', 'Your private lesson overview screen.')

export default function RouteLayout({ children }: { children: ReactNode }) {
  return <LearnerAuthShell>{children}</LearnerAuthShell>
}
