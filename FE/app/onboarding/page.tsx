'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Clock, Globe2, Languages, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FormField } from '@/components/forms/form-field'
import { useLearnerAuth } from '@/components/auth/learner-auth-provider'
import { AFRICAN_LANGUAGES } from '@/lib/constants/africanLanguages'
import { LANGUAGES } from '@/lib/constants'

const GOALS = [
  { id: '5', minutes: 5, label: 'Quick learner' },
  { id: '10', minutes: 10, label: 'Committed' },
  { id: '15', minutes: 15, label: 'Dedicated' },
] as const

export default function OnboardingPage() {
  const router = useRouter()
  const { session, updateProfile, isLoading } = useLearnerAuth()
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [countryOfOrigin, setCountryOfOrigin] = useState('')
  const [proficientLanguage, setProficientLanguage] = useState('')
  const [currentLanguage, setCurrentLanguage] = useState<'yoruba' | 'igbo' | 'hausa'>('yoruba')
  const [dailyGoalMinutes, setDailyGoalMinutes] = useState<number>(10)

  useEffect(() => {
    if (!session?.profile) return
    setCountryOfOrigin(session.profile.countryOfOrigin || '')
    setProficientLanguage(session.profile.proficientLanguage || '')
    setCurrentLanguage(session.profile.currentLanguage || 'yoruba')
    setDailyGoalMinutes(session.profile.dailyGoalMinutes || 10)
  }, [session?.profile])

  const learningLanguages = useMemo(
    () => LANGUAGES.filter((language) => language.id === 'yoruba' || language.id === 'igbo' || language.id === 'hausa'),
    []
  )

  const handleSubmit = async () => {
    if (!proficientLanguage.trim()) {
      setErrorMessage('Select the language you are most proficient in.')
      return
    }
    if (!countryOfOrigin.trim()) {
      setErrorMessage('Enter your country of origin.')
      return
    }

    setIsSaving(true)
    setErrorMessage('')

    try {
      await updateProfile({
        proficientLanguage,
        countryOfOrigin,
        currentLanguage,
        dailyGoalMinutes,
      })
      router.push('/dashboard')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save your profile right now.')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading || !session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <p className="text-sm font-semibold text-foreground/60">Preparing your onboarding...</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border/20 bg-background/95 px-4 py-5 backdrop-blur-sm">
        <div className="mx-auto max-w-3xl">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-primary/70">One last step</p>
          <h1 className="mt-2 text-3xl font-black text-foreground">Set up your learning profile</h1>
          <p className="mt-2 text-sm text-foreground/65">
            This helps us personalize your lessons from the first session.
          </p>
        </div>
      </header>

      <section className="px-4 py-10">
        <div className="mx-auto max-w-3xl space-y-8">
          <Card className="border border-border/50 p-6 sm:p-8">
            <div className="mb-6 flex items-center gap-3">
              <Languages className="h-5 w-5 text-primary" />
              <div>
                <h2 className="text-lg font-bold text-foreground">Language background</h2>
                <p className="text-sm text-foreground/60">Tell us the African language you know best.</p>
              </div>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Most proficient language</label>
                <Select value={proficientLanguage} onValueChange={setProficientLanguage}>
                  <SelectTrigger className="h-12">
                    <SelectValue placeholder="Select an African language" />
                  </SelectTrigger>
                  <SelectContent>
                    {AFRICAN_LANGUAGES.map((language) => (
                      <SelectItem key={language} value={language}>
                        {language}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <FormField
                label="Country of origin"
                name="countryOfOrigin"
                type="text"
                placeholder="e.g. Kenya"
                value={countryOfOrigin}
                onChange={(event) => setCountryOfOrigin(event.target.value)}
              />
            </div>
          </Card>

          <Card className="border border-border/50 p-6 sm:p-8">
            <div className="mb-6 flex items-center gap-3">
              <Globe2 className="h-5 w-5 text-primary" />
              <div>
                <h2 className="text-lg font-bold text-foreground">Choose your first learning language</h2>
                <p className="text-sm text-foreground/60">You can switch this later from your dashboard.</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {learningLanguages.map((language) => (
                <button
                  key={language.id}
                  type="button"
                  onClick={() => setCurrentLanguage(language.id as 'yoruba' | 'igbo' | 'hausa')}
                  className={`rounded-2xl border p-5 text-left transition-all ${
                    currentLanguage === language.id
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : 'border-border/50 hover:border-primary/40'
                  }`}
                >
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-foreground/45">{language.nativeName}</p>
                  <p className="mt-2 text-lg font-black text-foreground">{language.name}</p>
                  <p className="mt-2 text-sm text-foreground/60">{language.description}</p>
                </button>
              ))}
            </div>
          </Card>

          <Card className="border border-border/50 p-6 sm:p-8">
            <div className="mb-6 flex items-center gap-3">
              <Clock className="h-5 w-5 text-primary" />
              <div>
                <h2 className="text-lg font-bold text-foreground">Pick a daily goal</h2>
                <p className="text-sm text-foreground/60">Small, consistent sessions are enough.</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {GOALS.map((goal) => (
                <button
                  key={goal.id}
                  type="button"
                  onClick={() => setDailyGoalMinutes(goal.minutes)}
                  className={`rounded-2xl border p-5 text-left transition-all ${
                    dailyGoalMinutes === goal.minutes
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : 'border-border/50 hover:border-primary/40'
                  }`}
                >
                  <p className="text-3xl font-black text-foreground">{goal.minutes} min</p>
                  <p className="mt-2 text-sm font-semibold text-foreground/60">{goal.label}</p>
                </button>
              ))}
            </div>
          </Card>

          <Card className="border border-primary/25 bg-primary/5 p-5">
            <div className="flex items-start gap-3">
              <MapPin className="mt-0.5 h-5 w-5 text-primary" />
              <p className="text-sm font-medium leading-relaxed text-foreground/70">
                We use this information to personalize your lesson sequencing, explanations, and future curriculum guidance.
              </p>
            </div>
          </Card>

          {errorMessage ? <p className="text-sm font-medium text-red-600">{errorMessage}</p> : null}

          <div className="pb-8">
            <Button
              size="lg"
              className="h-14 w-full rounded-2xl text-base font-black"
              disabled={isSaving}
              onClick={() => void handleSubmit()}
            >
              {isSaving ? 'Saving profile...' : 'Start learning'}
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </div>
      </section>
    </main>
  )
}
