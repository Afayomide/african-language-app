'use client'

interface LogoShowcaseProps {
  size?: 'sm' | 'md' | 'lg'
}

export function LogoShowcase({ size = 'md' }: LogoShowcaseProps) {
  const sizeClasses = {
    sm: 'p-3 text-lg',
    md: 'p-4 text-3xl',
    lg: 'p-6 text-5xl',
  }

  return (
    <div className="flex justify-center">
      <div className="inline-flex items-center justify-center">
        <div className="relative">
          {/* Animated ring background */}
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-primary/20 via-accent/10 to-primary/20 blur-xl animate-pulse" />
          <div className={`relative flex items-center justify-center rounded-2xl bg-gradient-to-br from-primary via-primary/80 to-accent ${sizeClasses[size]} shadow-2xl`}>
            <span className="font-black text-white tracking-tighter">LinguaHub</span>
          </div>
        </div>
      </div>
    </div>
  )
}
