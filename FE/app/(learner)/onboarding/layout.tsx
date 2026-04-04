import type { ReactNode } from 'react'
import { buildNoIndexMetadata } from '@/lib/seo'

export const metadata = buildNoIndexMetadata('Learner Onboarding', 'Private learner onboarding flow.')

export default function RouteLayout({ children }: { children: ReactNode }) {
  return children
}
