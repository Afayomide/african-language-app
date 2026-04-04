'use client'

import type { ReactNode } from 'react'
import { LearnerAuthProvider } from '@/components/auth/learner-auth-provider'

export function LearnerAuthShell({ children }: { children: ReactNode }) {
  return <LearnerAuthProvider>{children}</LearnerAuthProvider>
}
