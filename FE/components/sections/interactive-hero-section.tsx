import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowRight } from 'lucide-react'
import { HeroCharacterCarousel } from '@/components/sections/hero-character-carousel'

export function InteractiveHeroSection({
  primaryHref = '/auth/signup',
  primaryLabel = 'Start Learning',
}: {
  primaryHref?: string
  primaryLabel?: string
}) {
  const characters = [
    { src: '/characters/yoruba-woman.jpg', name: 'Yoruba' },
    { src: '/characters/hausa-woman.jpg', name: 'Hausa' },
    { src: '/characters/igbo-woman.jpg', name: 'Igbo' },
    { src: '/characters/pidgin-character.jpg', name: 'Pidgin' },
  ]

  return (
    <section className="relative overflow-hidden px-4 py-16 md:py-32 min-h-screen flex items-center">
      {/* Animated background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-background via-primary/5 to-accent/10" />

      {/* Animated blob backgrounds */}
      <div
        className="absolute -left-32 -top-32 w-96 h-96 bg-primary/20 rounded-full blur-3xl animate-pulse"
      />
      <div
        className="absolute -right-32 -bottom-32 w-96 h-96 bg-accent/15 rounded-full blur-3xl animate-pulse"
      />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-primary/10 rounded-full blur-3xl" />

      {/* Grid pattern background */}
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

      <div className="relative z-10 mx-auto max-w-7xl w-full">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Left Content */}
          <div className="space-y-8 order-2 lg:order-1">
      
            {/* Main Heading */}
            <div className="space-y-4">
              <h1 className="text-5xl md:text-6xl lg:text-7xl font-black leading-tight text-foreground text-balance">
                Learn African <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">Languages</span> Through Living Cultures
              </h1>
              <p className="text-lg md:text-xl text-foreground/70 leading-relaxed max-w-xl">
                Start with Yoruba, Igbo, Hausa, and Pidgin, then build fluency through African stories, voices, and everyday context.
              </p>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              <Link href={primaryHref}>
                <Button
                  size="lg"
                  className="gap-2 px-8 text-base font-semibold shadow-lg hover:shadow-xl transition-all duration-200"
                >
                  {primaryLabel}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="#features">
                <Button
                  size="lg"
                  variant="outline"
                  className="px-8 text-base font-semibold border-2 hover:bg-foreground/5 transition-all duration-200 bg-transparent"
                >
                  Learn More
                </Button>
              </Link>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 pt-8 border-t border-border/20">
              <div className="space-y-1">
                <p className="text-2xl font-black text-primary">4</p>
                <p className="text-sm text-foreground/60">Languages</p>
              </div>
              <div className="space-y-1">
                <p className="text-2xl font-black text-primary">10K+</p>
                <p className="text-sm text-foreground/60">Learners</p>
              </div>
              <div className="space-y-1">
                <p className="text-2xl font-black text-primary">95%</p>
                <p className="text-sm text-foreground/60">Satisfaction</p>
              </div>
            </div>
          </div>

          <HeroCharacterCarousel characters={characters} />
        </div>
      </div>
    </section>
  )
}
