import type { ReactNode } from 'react'
import { buildNoIndexMetadata } from '@/lib/seo'

export const metadata = buildNoIndexMetadata('Your Curriculum', 'Your private learner curriculum path.')

export default function RouteLayout({ children }: { children: ReactNode }) {
  return children
}
