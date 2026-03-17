'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { LANGUAGES } from '@/lib/constants'

export function AfricaMapSection() {
  const [selectedLanguageId, setSelectedLanguageId] = useState<string>('yoruba')

  const selectedLanguage = useMemo(
    () => LANGUAGES.find((language) => language.id === selectedLanguageId) ?? LANGUAGES[0],
    [selectedLanguageId]
  )

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-background via-background to-primary/5 px-4 py-20">
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
          <h2 className="mb-4 text-4xl font-black text-foreground text-balance md:text-5xl">
            Built for African Language Learning
          </h2>
          <p className="mx-auto max-w-3xl text-lg text-foreground/70">
            LinguaHub is being shaped as a continent-scale language platform. The current launch
            starts with Yoruba, Igbo, Hausa, and Pidgin, with room to grow across Africa over time.
          </p>
        </div>

        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
          <Card className="overflow-hidden border-2 border-primary/20 bg-white/70 shadow-2xl backdrop-blur-sm">
            <div className="relative aspect-[4/5] min-h-[420px] bg-gradient-to-br from-sky-50 via-white to-emerald-50">
              <Image
                src="/africa-map.png"
                alt="Map of Africa"
                fill
                priority
                className="object-contain p-8"
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
              <div className="absolute left-6 top-6 rounded-full border border-primary/20 bg-background/90 px-4 py-2 shadow-sm backdrop-blur">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/80">
                  Africa
                </p>
              </div>
              <div className="absolute bottom-6 left-6 right-6 rounded-3xl border border-border/40 bg-background/88 p-5 shadow-lg backdrop-blur">
                <p className="text-sm font-semibold text-foreground">Start from the map</p>
                <p className="mt-2 text-sm leading-relaxed text-foreground/70">
                  Explore the continent, pick a language, and start with practical greetings,
                  listening, and everyday conversation.
                </p>
              </div>
            </div>
          </Card>

          <div className="space-y-6">
            <Card className="overflow-hidden border-2 border-primary/30 bg-white/70 shadow-xl backdrop-blur-sm">
              <div className="grid grid-cols-2 gap-4 bg-gradient-to-br from-primary/10 to-accent/10 p-6">
                <div className="relative aspect-square overflow-hidden rounded-2xl bg-white/50 shadow-lg">
                  <Image
                    src={selectedLanguage.femaleCharacter || '/placeholder.svg'}
                    alt={`${selectedLanguage.name} woman`}
                    fill
                    className="object-cover transition-transform duration-300 hover:scale-110"
                    sizes="(max-width: 768px) 100px, 150px"
                  />
                </div>
                <div className="relative aspect-square overflow-hidden rounded-2xl bg-white/50 shadow-lg">
                  <Image
                    src={selectedLanguage.maleCharacter || '/placeholder.svg'}
                    alt={`${selectedLanguage.name} man`}
                    fill
                    className="object-cover transition-transform duration-300 hover:scale-110"
                    sizes="(max-width: 768px) 100px, 150px"
                  />
                </div>
              </div>

              <div className="space-y-5 p-8">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.24em] text-primary/80">
                    Launch language
                  </p>
                  <h3 className="text-2xl font-bold text-foreground">{selectedLanguage.name}</h3>
                  <p className="mb-4 text-sm text-foreground/60">{selectedLanguage.nativeName}</p>
                  <p className="leading-relaxed text-foreground/70">{selectedLanguage.description}</p>
                </div>

                <div className="rounded-2xl border border-border/40 bg-background/80 p-4">
                  <p className="mb-2 text-sm font-semibold text-foreground">What you will practice</p>
                  <p className="text-sm leading-relaxed text-foreground/70">
                    Learn pronunciation, core vocabulary, listening, and useful phrases you can use in
                    real conversations.
                  </p>
                </div>

                <div className="border-t border-border/30 pt-4">
                  <p className="mb-2 text-sm font-semibold text-primary">
                    {Intl.NumberFormat().format(selectedLanguage.speakers)} speakers
                  </p>
                  <div className="h-2 overflow-hidden rounded-full bg-border/30">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-500"
                      style={{
                        width:
                          selectedLanguage.id === 'yoruba'
                            ? '52%'
                            : selectedLanguage.id === 'igbo'
                              ? '38%'
                              : selectedLanguage.id === 'hausa'
                                ? '82%'
                                : '75%',
                      }}
                    />
                  </div>
                </div>

                <Button asChild className="mt-2 w-full font-semibold shadow-lg transition-all duration-300 hover:shadow-xl">
                  <Link href="/language-selection">Start Learning {selectedLanguage.name}</Link>
                </Button>
              </div>
            </Card>

            <div className="flex flex-wrap gap-3">
              {LANGUAGES.map((language) => (
                <button
                  key={language.id}
                  onClick={() => setSelectedLanguageId(language.id)}
                  className={`rounded-full px-4 py-2 font-semibold transition-all duration-300 hover:scale-105 ${
                    selectedLanguageId === language.id
                      ? 'bg-gradient-to-r from-primary to-accent text-white shadow-lg'
                      : 'border-2 border-border/30 bg-white text-foreground hover:border-primary/50'
                  }`}
                >
                  {language.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
