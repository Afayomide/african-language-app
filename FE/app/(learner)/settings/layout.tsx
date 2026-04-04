import type { ReactNode } from 'react'
import { buildNoIndexMetadata } from '@/lib/seo'

export const metadata = buildNoIndexMetadata('Account Settings', 'Your private learner account settings.')

export default function RouteLayout({ children }: { children: ReactNode }) {
  return children
}
