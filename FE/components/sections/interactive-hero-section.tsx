'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { LogoShowcase } from '@/components/branding/logo-showcase'
import { ArrowRight } from 'lucide-react'

export function InteractiveHeroSection() {
  const [scrollY, setScrollY] = useState(0)
  const [activeCharacter, setActiveCharacter] = useState(0)

  const characters = [
    { src: '/characters/yoruba-woman.jpg', name: 'Yoruba' },
    { src: '/characters/hausa-woman.jpg', name: 'Hausa' },
    { src: '/characters/igbo-woman.jpg', name: 'Igbo' },
    { src: '/characters/pidgin-character.jpg', name: 'Pidgin' },
  ]

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveCharacter((prev) => (prev + 1) % characters.length)
    }, 4000)
    return () => clearInterval(interval)
  }, [characters.length])

  return (
    <section className="relative overflow-hidden px-4 py-16 md:py-32 min-h-screen flex items-center">
      {/* Animated background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-background via-primary/5 to-accent/10" />

      {/* Animated blob backgrounds */}
      <div
        className="absolute -left-32 -top-32 w-96 h-96 bg-primary/20 rounded-full blur-3xl"
        style={{ transform: `translateY(${scrollY * 0.3}px)` }}
      />
      <div
        className="absolute -right-32 -bottom-32 w-96 h-96 bg-accent/15 rounded-full blur-3xl"
        style={{ transform: `translateY(${-scrollY * 0.2}px)` }}
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
            {/* Logo */}
            <div className="flex justify-start">
              <div className="inline-flex items-center justify-center">
                <div className="relative">
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-primary/20 via-accent/10 to-primary/20 blur-xl animate-pulse" />
                  <div className="relative flex items-center justify-center rounded-2xl bg-gradient-to-br from-primary via-primary/80 to-accent p-3 shadow-2xl">
                    <span className="text-xl font-black text-white tracking-tighter">
                      LinguaHub
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Main Heading */}
            <div className="space-y-4">
              <h1 className="text-5xl md:text-6xl lg:text-7xl font-black leading-tight text-foreground text-balance">
                Discover Nigeria's Rich <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">Languages</span>
              </h1>
              <p className="text-lg md:text-xl text-foreground/70 leading-relaxed max-w-xl">
                From the rhythmic Yoruba of the Southwest to the melodic Hausa of the North, explore the linguistic heritage of Nigeria with our AI-powered platform.
              </p>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              <Link href="/language-selection">
                <Button
                  size="lg"
                  className="gap-2 px-8 text-base font-semibold shadow-lg hover:shadow-xl transition-all duration-200"
                >
                  Start Learning
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Button
                size="lg"
                variant="outline"
                className="px-8 text-base font-semibold border-2 hover:bg-foreground/5 transition-all duration-200 bg-transparent"
              >
                Learn More
              </Button>
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

          {/* Right Character Animation */}
          <div className="relative h-[500px] md:h-[600px] order-1 lg:order-2">
            {/* Character carousel */}
            <div className="relative w-full h-full flex items-center justify-center">
              {characters.map((character, index) => (
                <div
                  key={character.name}
                  className={`absolute inset-0 transition-all duration-1000 ease-out ${
                    index === activeCharacter
                      ? 'opacity-100 scale-100'
                      : 'opacity-0 scale-95 pointer-events-none'
                  }`}
                >
                  {/* Character frame */}
                  <div className="relative w-full h-full flex items-center justify-center">
                    {/* Decorative background circle */}
                    <div className="absolute inset-12 rounded-full bg-gradient-to-br from-primary/10 to-accent/10 blur-3xl animate-pulse" />

                    {/* Character image */}
                    <div className="relative w-64 h-80 md:w-72 md:h-96 rounded-3xl overflow-hidden shadow-2xl border-8 border-white/50 backdrop-blur-sm">
                      <Image
                        src={character.src || "/placeholder.svg"}
                        alt={character.name}
                        fill
                        className="object-cover"
                        sizes="300px"
                        priority={index === activeCharacter}
                      />
                      {/* Gradient overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />

                      {/* Character label */}
                      <div className="absolute bottom-4 left-4 right-4 text-white text-center">
                        <p className="text-2xl font-black drop-shadow-lg">
                          {character.name}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {/* Character selector dots */}
              <div className="absolute bottom-0 left-0 right-0 flex justify-center gap-3">
                {characters.map((character, index) => (
                  <button
                    key={character.name}
                    onClick={() => setActiveCharacter(index)}
                    className={`w-3 h-3 rounded-full transition-all duration-300 ${
                      index === activeCharacter
                        ? 'bg-primary w-8'
                        : 'bg-border/50 hover:bg-primary/50'
                    }`}
                    aria-label={`Show ${character.name}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
