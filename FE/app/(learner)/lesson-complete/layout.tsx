import type { ReactNode } from 'react'
import { buildNoIndexMetadata } from '@/lib/seo'

export const metadata = buildNoIndexMetadata('Lesson Complete', 'Your private lesson completion summary.')

export default function RouteLayout({ children }: { children: ReactNode }) {
  return children
}
