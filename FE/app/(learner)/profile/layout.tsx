import type { ReactNode } from 'react'
import { buildNoIndexMetadata } from '@/lib/seo'

export const metadata = buildNoIndexMetadata('Learner Profile', 'Your private learner profile.')

export default function RouteLayout({ children }: { children: ReactNode }) {
  return children
}
