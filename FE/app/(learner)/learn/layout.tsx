import type { ReactNode } from 'react'
import { buildNoIndexMetadata } from '@/lib/seo'

export const metadata = buildNoIndexMetadata('Learn', 'Your private learner practice area.')

export default function RouteLayout({ children }: { children: ReactNode }) {
  return children
}
