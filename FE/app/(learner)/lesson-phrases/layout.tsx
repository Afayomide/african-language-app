import type { ReactNode } from 'react'
import { buildNoIndexMetadata } from '@/lib/seo'

export const metadata = buildNoIndexMetadata('Lesson Phrases', 'Private learner lesson phrase practice.')

export default function RouteLayout({ children }: { children: ReactNode }) {
  return children
}
