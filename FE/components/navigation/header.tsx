'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/branding/logo'

interface NavLink {
  label: string
  href: string
}

interface HeaderProps {
  navLinks?: NavLink[]
  showAuthButtons?: boolean
  variant?: 'default' | 'minimal'
}

const defaultNavLinks: NavLink[] = [
  { label: 'Features', href: '#features' },
  { label: 'How It Works', href: '#how-it-works' },
]

export function Header({
  navLinks = defaultNavLinks,
  showAuthButtons = true,
  variant = 'default',
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/20 bg-background/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Logo href="/" />

        {variant === 'default' && (
          <>
            <nav className="hidden items-center gap-8 md:flex">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="text-sm text-foreground/70 hover:text-foreground transition"
                >
                  {link.label}
                </a>
              ))}
            </nav>

            {showAuthButtons && (
              <div className="flex items-center gap-3">
                <Link href="/auth/login">
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-border/50 bg-transparent hover:bg-foreground/5"
                  >
                    Sign In
                  </Button>
                </Link>
                <Link href="/auth/signup">
                  <Button size="sm">Get Started</Button>
                </Link>
              </div>
            )}
          </>
        )}

        {variant === 'minimal' && (
          <Link href="/dashboard">
            <Button variant="ghost" size="sm">
              Back to Dashboard
            </Button>
          </Link>
        )}
      </div>
    </header>
  )
}
