import type { ReactNode } from 'react'
import { LearnerAuthShell } from '@/components/auth/learner-auth-shell'
import { buildNoIndexMetadata } from '@/lib/seo'

export const metadata = buildNoIndexMetadata(
  'Learner Authentication',
  'Sign in or create your LinguaHub learner account.',
)

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <LearnerAuthShell>{children}</LearnerAuthShell>
}
