import type { ReactNode } from 'react'
import { buildNoIndexMetadata } from '@/lib/seo'

export const metadata = buildNoIndexMetadata('Lesson Resources', 'Private learner lesson resources.')

export default function RouteLayout({ children }: { children: ReactNode }) {
  return children
}
