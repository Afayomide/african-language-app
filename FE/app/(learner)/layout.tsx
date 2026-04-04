import type { ReactNode } from 'react'
import { LearnerAuthShell } from '@/components/auth/learner-auth-shell'
import { LearnerQueryProvider } from '@/components/providers/learner-query-provider'
import { buildNoIndexMetadata } from '@/lib/seo'

export const metadata = buildNoIndexMetadata('Learner App', 'Private learner application area.')

export default function LearnerLayout({ children }: { children: ReactNode }) {
  return (
    <LearnerAuthShell>
      <LearnerQueryProvider>{children}</LearnerQueryProvider>
    </LearnerAuthShell>
  )
}
