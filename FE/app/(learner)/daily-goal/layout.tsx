import type { ReactNode } from 'react'
import { buildNoIndexMetadata } from '@/lib/seo'

export const metadata = buildNoIndexMetadata('Daily Goal', 'Your private learner daily goal settings.')

export default function RouteLayout({ children }: { children: ReactNode }) {
  return children
}
