'use client'

import { Logo } from '@/components/branding/logo'

interface LogoShowcaseProps {
  size?: 'sm' | 'md' | 'lg'
}

export function LogoShowcase({ size = 'md' }: LogoShowcaseProps) {
  return (
    <div className="flex justify-center">
      <Logo href={null} variant="icon-only" size={size} surface="showcase" />
    </div>
  )
}
