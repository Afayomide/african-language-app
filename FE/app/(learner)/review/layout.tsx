import type { ReactNode } from 'react'
import { buildNoIndexMetadata } from '@/lib/seo'

export const metadata = buildNoIndexMetadata('Lesson Review', 'Your private learner review screen.')

export default function RouteLayout({ children }: { children: ReactNode }) {
  return children
}
