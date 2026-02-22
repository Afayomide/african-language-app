'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { LanguageCard } from '@/components/cards/language-card'
import { LANGUAGES } from '@/lib/constants'
import { ArrowRight } from 'lucide-react' // Import ArrowRight component
import { learnerDashboardService } from '@/services'

export default function LanguageSelectionScreen() {
  const [selectedLanguage, setSelectedLanguage] = useState<string | null>(null)
  const languages = LANGUAGES; // Declare the languages variable

  const handleContinue = () => {
    if (selectedLanguage) {
      learnerDashboardService
        .updateLanguage(selectedLanguage as "yoruba" | "igbo" | "hausa")
        .catch((error) => console.error("Failed to update language", error))
        .finally(() => {
          window.location.href = `/daily-goal?language=${selectedLanguage}`
        })
    }
  }

  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/20 bg-background/95 px-4 py-4 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <Link href="/">
            <Button variant="ghost" size="icon">
              <ArrowRight className="h-5 w-5" /> {/* Use ArrowRight component */}
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
          <div className="grid gap-8 md:grid-cols-2">
            {LANGUAGES.map((language) => (
              <div
                key={language.id}
                className={`cursor-pointer rounded-lg transition-all duration-200 ring-2 ${
                  selectedLanguage === language.id
                    ? 'ring-primary'
                    : 'ring-transparent hover:ring-primary/30'
                }`}
                onClick={() => setSelectedLanguage(language.id)}
              >
                <LanguageCard
                  id={language.id}
                  name={language.name}
                  nativeName={language.nativeName}
                  description={language.description}
                  speakers={language.speakers}
                  maleCharacter={language.maleCharacter}
                  femaleCharacter={language.femaleCharacter}
                  href={`/daily-goal?language=${language.id}`}
                />
              </div>
            ))}
          </div>

          {/* Continue Button */}
          <div className="fixed bottom-0 left-0 right-0 border-t border-border/20 bg-background/95 p-4 backdrop-blur-sm">
            <div className="mx-auto max-w-2xl">
              <Button
                size="lg"
                className="w-full gap-2"
                disabled={!selectedLanguage}
                onClick={handleContinue}
              >
                Continue
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
