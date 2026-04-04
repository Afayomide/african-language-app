import type { ReactNode } from 'react'
import { buildNoIndexMetadata } from '@/lib/seo'

export const metadata = buildNoIndexMetadata('Sentence Builder', 'A private learner sentence builder.')

export default function RouteLayout({ children }: { children: ReactNode }) {
  return children
}
