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
  { id: 'yoruba', name: 'Yoruba Country', x: 315, y: 548, character: 'Southwest Nigeria' },
  { id: 'igbo', name: 'Igbo Land', x: 372, y: 578, character: 'Southeast Nigeria' },
  { id: 'hausa', name: 'Hausa Region', x: 338, y: 458, character: 'Northern Nigeria' },
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
            Explore Africa, Starting from Nigeria
          </h2>
          <p className="text-lg text-foreground/70">
            See where Nigeria sits in Africa, then explore the language regions that shape its cultural voice
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Interactive Map Area */}
          <div className="relative h-[400px] md:h-[500px] bg-gradient-to-br from-blue-100 to-blue-50 rounded-3xl overflow-hidden shadow-2xl border border-primary/20">
            {/* Africa map with Nigeria highlighted */}
            <svg
              viewBox="0 0 900 1200"
              className="w-full h-full"
              style={{ background: 'linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%)' }}
              preserveAspectRatio="xMidYMid meet"
            >
              <defs>
                <radialGradient id="nigeriaGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#f97316" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
                </radialGradient>
              </defs>

              {/* Africa outline */}
              <path
                d="M280 80
                  C350 46 430 38 500 54
                  C565 68 635 60 690 92
                  C746 126 788 184 816 256
                  C836 306 878 336 874 386
                  C870 432 824 476 804 550
                  C786 622 820 712 794 808
                  C770 896 716 992 646 1078
                  C606 1128 566 1172 508 1190
                  C458 1206 420 1170 396 1120
                  C372 1068 354 1012 316 962
                  C270 904 204 846 172 756
                  C142 674 100 610 108 522
                  C114 448 164 390 190 336
                  C212 290 198 234 210 178
                  C222 126 248 96 280 80 Z"
                fill="#fef3c7"
                stroke="#d97706"
                strokeWidth="14"
                strokeLinejoin="round"
                opacity="0.95"
              />

              {/* Nigeria highlight */}
              <ellipse cx="342" cy="522" rx="72" ry="108" fill="url(#nigeriaGlow)" />
              <path
                d="M300 430
                  C328 420 352 422 376 438
                  C394 456 400 486 394 516
                  C390 544 396 572 386 596
                  C372 626 344 638 318 634
                  C292 630 278 606 280 580
                  C280 554 272 526 274 500
                  C276 470 282 444 300 430 Z"
                fill="rgba(34,197,94,0.18)"
                stroke="#15803d"
                strokeWidth="7"
                strokeDasharray="18 12"
              />

              <text
                x="420"
                y="448"
                className="text-[46px] font-black fill-foreground/80"
              >
                Nigeria
              </text>

              <path d="M405 456 L384 486" stroke="#111827" strokeWidth="5" strokeLinecap="round" opacity="0.55" />

              {/* Interactive language markers */}
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
                    r={hoveredRegion === region.id ? 20 : 16}
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
                        r={34}
                        fill="none"
                        stroke="#f97316"
                        strokeWidth="5"
                        opacity="0.5"
                        className="animate-pulse"
                      />
                      <text
                        x={region.x}
                        y={region.y - 34}
                        textAnchor="middle"
                        className="text-[34px] font-black fill-foreground"
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
