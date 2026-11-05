'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { LanguageCard } from '@/components/cards/language-card'
import { LANGUAGES } from '@/lib/constants'
import { ChevronLeft } from 'lucide-react'
import { learnerDashboardService } from '@/services'
import { withRetry } from '@lesson-player/retry'

export default function LanguageSelectionScreen() {
  const [selectedLanguage, setSelectedLanguage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)

  const handleContinue = async () => {
    if (!selectedLanguage || isSaving) return
    setIsSaving(true)
    setSaveFailed(false)
    try {
      await withRetry(() => learnerDashboardService.updateLanguage(selectedLanguage as "yoruba" | "igbo" | "hausa"))
      window.location.href = `/daily-goal?language=${selectedLanguage}`
    } catch (error) {
      // Moving on here would start lessons in the wrong language, so stay and say so.
      console.error("Failed to update language", error)
      setSaveFailed(true)
      setIsSaving(false)
    }
  }

  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/20 bg-background/95 px-4 py-4 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <Link href="/">
            <Button variant="ghost" size="icon" aria-label="Back">
              <ChevronLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold text-foreground">Choose a Language</h1>
          <div className="w-10" />
        </div>
      </header>

      {/* Content */}
      <section className="px-4 py-12">
        <div className="mx-auto max-w-2xl space-y-6">
          <div className="text-center">
            <p className="text-foreground/70">
              Pick a language and start your learning journey. You can always switch later.
            </p>
          </div>

          {/* Language Cards Grid */}
          <div className="grid gap-8 md:grid-cols-2" role="radiogroup" aria-label="Language">
            {LANGUAGES.map((language) => (
              <div
                key={language.id}
                role="radio"
                aria-checked={selectedLanguage === language.id}
                tabIndex={0}
                className={`cursor-pointer rounded-lg transition-all duration-200 ring-2 focus-visible:outline-none focus-visible:ring-primary ${
                  selectedLanguage === language.id
                    ? 'ring-primary'
                    : 'ring-transparent hover:ring-primary/30'
                }`}
                onClick={() => setSelectedLanguage(language.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    setSelectedLanguage(language.id)
                  }
                }}
              >
                <LanguageCard
                  id={language.id}
                  name={language.name}
                  nativeName={language.nativeName}
                  description={language.description}
                  speakers={language.speakers}
                  maleCharacter={language.maleCharacter}
                  femaleCharacter={language.femaleCharacter}
                />
              </div>
            ))}
          </div>

          {/* Continue Button */}
          <div className="fixed bottom-0 left-0 right-0 border-t border-border/20 bg-background/95 p-4 backdrop-blur-sm">
            <div className="mx-auto max-w-2xl space-y-2">
              {saveFailed ? (
                <p role="alert" className="text-center text-sm font-medium text-destructive">
                  We couldn&apos;t save your language. Check your connection and try again.
                </p>
              ) : null}
              <Button
                size="lg"
                className="w-full gap-2"
                disabled={!selectedLanguage || isSaving}
                onClick={handleContinue}
              >
                {isSaving ? 'Saving...' : saveFailed ? 'Try again' : 'Continue'}
              </Button>
            </div>
          </div>

          {/* Spacer for fixed button */}
          <div className="h-24" />
        </div>
      </section>
    </main>
  )
}
