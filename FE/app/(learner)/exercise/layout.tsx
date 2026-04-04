import type { ReactNode } from 'react'
import { buildNoIndexMetadata } from '@/lib/seo'

export const metadata = buildNoIndexMetadata('Lesson Exercise', 'A private learner lesson exercise screen.')

export default function RouteLayout({ children }: { children: ReactNode }) {
  return children
}
