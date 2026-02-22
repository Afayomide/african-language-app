'use client'

import React from "react"

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowRight } from 'lucide-react'

interface HeroSectionProps {
  title: string
  subtitle: string
  primaryCta?: {
    label: string
    href: string
  }
  secondaryCta?: {
    label: string
    href: string
  }
  trustMetric?: string
  children?: React.ReactNode
}

export function HeroSection({
  title,
  subtitle,
  primaryCta = { label: 'Start Your Journey', href: '/language-selection' },
  secondaryCta = { label: 'Sign Up Free', href: '/auth/signup' },
  trustMetric,
  children,
}: HeroSectionProps) {
  return (
    <section className="relative overflow-hidden px-4 py-16 md:py-40">
      {/* Grid background pattern */}
      <div className="absolute inset-0 overflow-hidden">
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
      </div>

      {/* Animated blur orbs */}
      <div
        className="absolute left-0 top-0 h-96 w-96 rounded-full bg-primary/20 blur-3xl animate-pulse"
        style={{ animationDuration: '4s' }}
      />
      <div
        className="absolute right-0 top-32 h-80 w-80 rounded-full bg-accent/15 blur-3xl animate-pulse"
        style={{ animationDuration: '5s', animationDelay: '1s' }}
      />
      <div
        className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-primary/10 blur-3xl animate-pulse"
        style={{ animationDuration: '6s', animationDelay: '2s' }}
      />

      <div className="relative mx-auto max-w-5xl space-y-10 text-center">
        {/* Custom children content (like logo) */}
        {children}

        {/* Main heading */}
        <div className="relative space-y-6">
          <h1 className="text-balance text-5xl font-black leading-tight text-foreground md:text-7xl">
            {title}
          </h1>
          <p className="text-balance mx-auto max-w-2xl text-lg md:text-xl text-foreground/70 leading-relaxed">
            {subtitle}
          </p>
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-col items-center justify-center gap-4 pt-2 sm:flex-row">
          <Link href={primaryCta.href}>
            <Button
              size="lg"
              className="gap-2 px-8 text-base font-semibold shadow-lg hover:shadow-xl transition-all duration-200"
            >
              {primaryCta.label}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link href={secondaryCta.href}>
            <Button
              size="lg"
              variant="outline"
              className="px-8 text-base font-semibold border-2 hover:bg-foreground/5 transition-all duration-200 bg-transparent"
            >
              {secondaryCta.label}
            </Button>
          </Link>
        </div>

        {/* Trust metric */}
        {trustMetric && (
          <div className="pt-4 text-sm text-foreground/60">
            <p>{trustMetric}</p>
          </div>
        )}
      </div>
    </section>
  )
}
