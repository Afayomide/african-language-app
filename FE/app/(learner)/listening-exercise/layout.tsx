import type { ReactNode } from 'react'
import { buildNoIndexMetadata } from '@/lib/seo'

export const metadata = buildNoIndexMetadata('Listening Exercise', 'A private learner listening exercise.')

export default function RouteLayout({ children }: { children: ReactNode }) {
  return children
}
