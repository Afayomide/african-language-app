'use client'

import React from "react"

import Link from 'next/link'
import { Logo } from '@/components/branding/logo'

interface AuthLayoutProps {
  title: string
  subtitle: string
  children: React.ReactNode
  footerText: string
  footerLink: {
    text: string
    href: string
  }
}

export function AuthLayout({
  title,
  subtitle,
  children,
  footerText,
  footerLink,
}: AuthLayoutProps) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-background">
      {/* Animated background elements */}
      <div
        className="absolute left-0 top-0 h-96 w-96 rounded-full bg-primary/10 blur-3xl animate-pulse"
        style={{ animationDuration: '4s' }}
      />
      <div
        className="absolute right-0 bottom-0 h-80 w-80 rounded-full bg-accent/10 blur-3xl animate-pulse"
        style={{ animationDuration: '5s', animationDelay: '1s' }}
      />

      {/* Grid background */}
      <div className="absolute inset-0 opacity-5">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(rgba(0,0,0,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,.1) 1px, transparent 1px)',
            backgroundSize: '50px 50px',
          }}
        />
      </div>

      <div className="relative flex min-h-screen flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="mb-8 space-y-4 text-center">
            <Logo href="/" size="md" className="inline-flex items-center justify-center" />
            <h1 className="text-3xl font-bold text-foreground">{title}</h1>
            <p className="text-foreground/60">{subtitle}</p>
          </div>

          {/* Content */}
          {children}

          {/* Footer */}
          <p className="mt-8 text-center text-sm text-foreground/70">
            {footerText}{' '}
            <Link
              href={footerLink.href}
              className="font-semibold text-primary hover:underline"
            >
              {footerLink.text}
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
