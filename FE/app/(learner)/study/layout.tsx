import type { ReactNode } from 'react'
import { buildNoIndexMetadata } from '@/lib/seo'

export const metadata = buildNoIndexMetadata('Study Lesson', 'Your private learner lesson player.')

export default function RouteLayout({ children }: { children: ReactNode }) {
  return children
}
