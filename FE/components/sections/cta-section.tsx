'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowRight } from 'lucide-react'

interface CTASectionProps {
  title: string
  description: string
  ctaLabel?: string
  ctaHref?: string
}

export function CTASection({
  title,
  description,
  ctaLabel = 'Start Your Journey',
  ctaHref = '/language-selection',
}: CTASectionProps) {
  return (
    <section className="relative px-4 py-20">
      <div className="mx-auto max-w-4xl rounded-2xl bg-gradient-to-r from-primary/90 to-accent/90 p-12 text-center">
        <h2 className="mb-4 text-3xl font-bold text-primary-foreground">
          {title}
        </h2>
        <p className="mb-8 text-lg text-primary-foreground/90">{description}</p>
        <Link href={ctaHref}>
          <Button
            size="lg"
            className="gap-2 bg-white px-8 text-base text-primary hover:bg-primary-foreground"
          >
            {ctaLabel}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    </section>
  )
}
