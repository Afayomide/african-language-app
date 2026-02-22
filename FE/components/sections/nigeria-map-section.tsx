'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Card } from '@/components/ui/card'
import { LANGUAGES } from '@/lib/constants'

interface RegionInfo {
  id: string
  name: string
  x: number
  y: number
  character: string
}

const regions: RegionInfo[] = [
  { id: 'yoruba', name: 'Yoruba Country', x: 20, y: 65, character: 'Southwest' },
  { id: 'igbo', name: 'Igbo Land', x: 55, y: 70, character: 'Southeast' },
  { id: 'hausa', name: 'Hausa Region', x: 40, y: 30, character: 'North' },
]

export function NigeriaMapSection() {
  const [hoveredRegion, setHoveredRegion] = useState<string | null>(null)
  const [selectedRegion, setSelectedRegion] = useState<string>('yoruba')

  const selectedLanguage = LANGUAGES.find((l) => l.id === selectedRegion)
  const selectedRegionInfo = regions.find((r) => r.id === selectedRegion)

  return (
    <section className="relative px-4 py-20 overflow-hidden bg-gradient-to-b from-background via-background to-primary/5">
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

      <div className="relative mx-auto max-w-7xl">
        <div className="mb-16 text-center">
          <h2 className="text-4xl md:text-5xl font-black text-foreground mb-4 text-balance">
            Explore Nigeria's Linguistic Tapestry
          </h2>
          <p className="text-lg text-foreground/70">
            Hover over each region to discover the languages and cultures
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Interactive Map Area */}
          <div className="relative h-[400px] md:h-[500px] bg-gradient-to-br from-blue-100 to-blue-50 rounded-3xl overflow-hidden shadow-2xl border border-primary/20">
            {/* Simplified Nigeria Map */}
            <svg
              viewBox="0 0 100 140"
              className="w-full h-full"
              style={{ background: 'linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%)' }}
            >
              {/* Nigeria country shape (simplified) */}
              <path
                d="M 35 20 L 55 15 L 65 20 L 70 35 L 75 45 L 70 55 L 65 65 L 60 70 L 50 75 L 40 78 L 30 75 L 25 65 L 22 55 L 20 45 L 20 35 L 25 25 Z"
                fill="#fef3c7"
                stroke="#d97706"
                strokeWidth="1.5"
                opacity="0.8"
              />

              {/* Interactive regions */}
              {regions.map((region) => (
                <g
                  key={region.id}
                  onMouseEnter={() => setHoveredRegion(region.id)}
                  onMouseLeave={() => setHoveredRegion(null)}
                  onClick={() => setSelectedRegion(region.id)}
                  className="cursor-pointer transition-all duration-300"
                >
                  {/* Region circle */}
                  <circle
                    cx={region.x}
                    cy={region.y}
                    r={hoveredRegion === region.id ? 8 : 6}
                    fill={
                      selectedRegion === region.id
                        ? '#f97316'
                        : hoveredRegion === region.id
                          ? '#fbbf24'
                          : '#fb923c'
                    }
                    className="transition-all duration-300"
                  />
                  {hoveredRegion === region.id && (
                    <>
                      <circle
                        cx={region.x}
                        cy={region.y}
                        r={12}
                        fill="none"
                        stroke="#f97316"
                        strokeWidth="1"
                        opacity="0.5"
                        className="animate-pulse"
                      />
                      <text
                        x={region.x}
                        y={region.y - 16}
                        textAnchor="middle"
                        className="text-xs font-bold fill-foreground"
                      >
                        {region.name}
                      </text>
                    </>
                  )}
                </g>
              ))}
            </svg>

            {/* Decorative elements */}
            <div className="absolute top-4 right-4 text-2xl opacity-20">🗺️</div>
          </div>

          {/* Character & Info Card */}
          {selectedLanguage && selectedRegionInfo && (
            <div className="space-y-6">
              <Card className="border-2 border-primary/30 bg-white/60 backdrop-blur-sm overflow-hidden shadow-xl">
                {/* Character Images */}
                <div className="grid grid-cols-2 gap-4 p-6 bg-gradient-to-br from-primary/10 to-accent/10">
                  <div className="relative aspect-square rounded-2xl overflow-hidden bg-white/50 shadow-lg">
                    <Image
                      src={selectedLanguage.femaleCharacter || "/placeholder.svg"}
                      alt={`${selectedLanguage.name} woman`}
                      fill
                      className="object-cover hover:scale-110 transition-transform duration-300"
                      sizes="(max-width: 768px) 100px, 150px"
                    />
                  </div>
                  <div className="relative aspect-square rounded-2xl overflow-hidden bg-white/50 shadow-lg">
                    <Image
                      src={selectedLanguage.maleCharacter || "/placeholder.svg"}
                      alt={`${selectedLanguage.name} man`}
                      fill
                      className="object-cover hover:scale-110 transition-transform duration-300"
                      sizes="(max-width: 768px) 100px, 150px"
                    />
                  </div>
                </div>

                {/* Language Info */}
                <div className="p-8 space-y-4">
                  <div>
                    <h3 className="text-2xl font-bold text-foreground mb-2">
                      {selectedLanguage.name}
                    </h3>
                    <p className="text-sm text-foreground/60 mb-4">
                      {selectedLanguage.nativeName}
                    </p>
                    <p className="text-foreground/70 leading-relaxed">
                      {selectedLanguage.description}
                    </p>
                  </div>

                  <div className="pt-4 border-t border-border/30">
                    <p className="text-sm font-semibold text-primary mb-2">
                      {selectedLanguage.speakers}
                    </p>
                    <div className="h-2 bg-border/30 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-primary to-accent rounded-full transition-all duration-500"
                        style={{
                          width: selectedLanguage.nativeName === 'Yorùbá'
                            ? '85%'
                            : selectedLanguage.nativeName === 'Igbo'
                              ? '65%'
                              : '95%',
                        }}
                      />
                    </div>
                  </div>

                  <button className="w-full mt-6 px-6 py-3 bg-gradient-to-r from-primary to-accent text-white rounded-xl font-semibold hover:shadow-lg transition-all duration-300 transform hover:scale-105">
                    Start Learning {selectedLanguage.name}
                  </button>
                </div>
              </Card>

              {/* Language Selector Buttons */}
              <div className="flex flex-wrap gap-3">
                {LANGUAGES.filter((l) => l.id !== 'pidgin').map((language) => (
                  <button
                    key={language.id}
                    onClick={() => setSelectedRegion(language.id)}
                    className={`px-4 py-2 rounded-full font-semibold transition-all duration-300 transform hover:scale-105 ${
                      selectedRegion === language.id
                        ? 'bg-gradient-to-r from-primary to-accent text-white shadow-lg'
                        : 'bg-white border-2 border-border/30 text-foreground hover:border-primary/50'
                    }`}
                  >
                    {language.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
