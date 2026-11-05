import type { ReactNode } from 'react'
import { buildNoIndexMetadata } from '@/lib/seo'

export const metadata = buildNoIndexMetadata('Learner Dashboard', 'Your private Kela learner dashboard.')

export default function RouteLayout({ children }: { children: ReactNode }) {
  return children
}
