import { Card } from '@/components/ui/card'
import React from 'react'
import { Reveal } from '@/components/landing/reveal'

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
        <Reveal>
          <h2 className="mb-16 text-center font-display text-4xl font-black tracking-[-0.03em] text-foreground md:text-5xl">
            {title}
          </h2>
        </Reveal>

        <div className="grid gap-8 md:grid-cols-3">
          {features.map((feature, index) => {
            const Icon = feature.icon
            const accentColor = feature.accentColor === 'accent' ? 'accent' : 'primary'
            // The theme's accent is a pale beige, too faint for an icon, so the accent card uses green.
            const bgColor =
              accentColor === 'accent' ? 'bg-[#edf7ea]' : 'bg-primary/10'
            const textColor =
              accentColor === 'accent' ? 'text-[#2d7c37]' : 'text-primary'

            return (
              <Reveal key={index} delay={index * 90} className="h-full">
              <Card
                className="group relative h-full overflow-hidden rounded-[1.6rem] border-2 border-[#efe4d8] bg-white p-8 shadow-[0_5px_0_0_#efe4d8] transition-all duration-300 hover:-translate-y-1 hover:border-[#ffbe9b] hover:shadow-[0_8px_0_0_#ffdeac]"
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
              </Reveal>
            )
          })}
        </div>
      </div>
    </section>
  )
}
