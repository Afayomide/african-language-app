'use client'

import { Card } from '@/components/ui/card'
import React from 'react'

interface Feature {
  icon: React.ElementType
  title: string
  description: string
  accentColor?: 'primary' | 'accent'
}

interface FeaturesSectionProps {
  title: string
  features: Feature[]
}

export function FeaturesSection({ title, features }: FeaturesSectionProps) {
  return (
    <section id="features" className="relative px-4 py-20">
      <div className="mx-auto max-w-6xl">
        <h2 className="mb-16 text-center text-4xl font-bold text-foreground">
          {title}
        </h2>

        <div className="grid gap-8 md:grid-cols-3">
          {features.map((feature, index) => {
            const Icon = feature.icon
            const accentColor = feature.accentColor === 'accent' ? 'accent' : 'primary'
            const bgColor =
              accentColor === 'accent' ? 'bg-accent/10' : 'bg-primary/10'
            const textColor =
              accentColor === 'accent' ? 'text-accent' : 'text-primary'

            return (
              <Card
                key={index}
                className="group relative overflow-hidden border border-border/50 bg-white p-8 transition-all duration-300 hover:border-primary/50 hover:shadow-lg"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                <div className="relative space-y-4">
                  <div className={`inline-flex items-center justify-center rounded-lg ${bgColor} p-3`}>
                    <Icon className={`h-6 w-6 ${textColor}`} />
                  </div>
                  <h3 className="text-xl font-bold text-foreground">
                    {feature.title}
                  </h3>
                  <p className="text-foreground/70">{feature.description}</p>
                </div>
              </Card>
            )
          })}
        </div>
      </div>
    </section>
  )
}
