'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { LANGUAGES } from '@/lib/constants'

export function AfricaLanguageSelector({ startHref = '/auth/signup' }: { startHref?: string }) {
  const [selectedLanguageId, setSelectedLanguageId] = useState<string>('yoruba')

  const selectedLanguage = useMemo(
    () => LANGUAGES.find((language) => language.id === selectedLanguageId) ?? LANGUAGES[0],
    [selectedLanguageId],
  )

  return (
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
                className="h-full rounded-full bg-primary/50 transition-all duration-500"
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
            <Link href={startHref}>Start Learning {selectedLanguage.name}</Link>
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
                ? 'bg-primary text-white shadow-lg'
                : 'border-2 border-border/30 bg-white text-foreground hover:border-primary/50'
            }`}
          >
            {language.name}
          </button>
        ))}
      </div>
    </div>
  )
}
