import type { ReactNode } from 'react'
import { buildNoIndexMetadata } from '@/lib/seo'

export const metadata = buildNoIndexMetadata('Language Selection', 'Private language selection for learners.')

export default function RouteLayout({ children }: { children: ReactNode }) {
  return children
}
