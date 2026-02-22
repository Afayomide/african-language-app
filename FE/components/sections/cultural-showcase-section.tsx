'use client'

import Image from 'next/image'
import { Card } from '@/components/ui/card'

interface CulturalItem {
  title: string
  description: string
  icon: string
  color: string
}

const culturalItems: CulturalItem[] = [
  {
    title: 'Yoruba Greetings',
    description: 'Master the art of respectful greetings in Yoruba culture, where age and status are deeply honored.',
    icon: '🤝',
    color: 'from-orange-500 to-red-500',
  },
  {
    title: 'Hausa Traditions',
    description: 'Learn about the rich trading history and vibrant festivals that define Hausa communities.',
    icon: '🎭',
    color: 'from-amber-500 to-orange-500',
  },
  {
    title: 'Igbo Heritage',
    description: 'Explore the entrepreneurial spirit and colorful celebrations of Igbo culture.',
    icon: '🎨',
    color: 'from-yellow-500 to-amber-500',
  },
  {
    title: 'Pidgin Expressions',
    description: 'Discover the playful and expressive nature of Nigerian Pidgin English.',
    icon: '💬',
    color: 'from-green-500 to-emerald-500',
  },
]

export function CulturalShowcaseSection() {
  return (
    <section className="relative px-4 py-20 overflow-hidden">
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

      <div className="relative mx-auto max-w-6xl">
        <div className="mb-16 text-center">
          <h2 className="text-4xl md:text-5xl font-black text-foreground mb-4 text-balance">
            Celebrate Cultural Heritage
          </h2>
          <p className="text-lg text-foreground/70 max-w-2xl mx-auto">
            Language is more than words—it's the gateway to understanding rich traditions,
            customs, and the vibrant spirit of Nigerian cultures.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {culturalItems.map((item, index) => (
            <Card
              key={item.title}
              className="group relative overflow-hidden border-2 border-border/30 bg-white/60 backdrop-blur-sm hover:border-primary/50 transition-all duration-300 hover:shadow-xl"
            >
              {/* Gradient background on hover */}
              <div
                className={`absolute inset-0 bg-gradient-to-br ${item.color} opacity-0 group-hover:opacity-10 transition-opacity duration-300`}
              />

              {/* Content */}
              <div className="relative p-8 space-y-4 h-full flex flex-col">
                {/* Icon */}
                <div className="text-5xl">{item.icon}</div>

                {/* Title */}
                <h3 className="text-xl font-bold text-foreground group-hover:text-primary transition-colors duration-300">
                  {item.title}
                </h3>

                {/* Description */}
                <p className="text-sm text-foreground/70 flex-grow">
                  {item.description}
                </p>

                {/* Bottom accent line */}
                <div
                  className={`h-1 w-12 bg-gradient-to-r ${item.color} rounded-full group-hover:w-full transition-all duration-300`}
                />
              </div>
            </Card>
          ))}
        </div>

        {/* Character showcase */}
        <div className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            { src: '/characters/yoruba-woman.jpg', label: 'Yoruba Woman' },
            { src: '/characters/yoruba-man.jpg', label: 'Yoruba Man' },
            { src: '/characters/hausa-woman.jpg', label: 'Hausa Woman' },
            { src: '/characters/hausa-man.jpg', label: 'Hausa Man' },
            { src: '/characters/igbo-woman.jpg', label: 'Igbo Woman' },
            { src: '/characters/igbo-man.jpg', label: 'Igbo Man' },
            { src: '/characters/pidgin-character.jpg', label: 'Pidgin' },
            { src: '/characters/pidgin-character.jpg', label: 'Pidgin' },
          ].map((character, index) => (
            <div
              key={`${character.label}-${index}`}
              className="group relative rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 h-64 md:h-72"
            >
              <Image
                src={character.src || "/placeholder.svg"}
                alt={character.label}
                fill
                className="object-cover group-hover:scale-110 transition-transform duration-300"
                sizes="(max-width: 768px) 200px, 250px"
              />
              {/* Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
              {/* Label */}
              <div className="absolute bottom-4 left-4 right-4">
                <p className="text-white font-bold text-sm md:text-base text-center drop-shadow-lg">
                  {character.label}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
