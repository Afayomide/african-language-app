'use client'

import { useState, Suspense } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ArrowRight, ChevronLeft, Clock } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { learnerDashboardService } from '@/services'

const goals = [
  { id: '5', minutes: 5, description: 'Quick learner' },
  { id: '10', minutes: 10, description: 'Committed' },
  { id: '15', minutes: 15, description: 'Dedicated' },
]

function DailyGoalContent() {
  const searchParams = useSearchParams()
  const language = searchParams.get('language') || 'language'
  const [selectedGoal, setSelectedGoal] = useState<string | null>(null)

  const handleContinue = () => {
    if (selectedGoal) {
      learnerDashboardService
        .updateDailyGoal(Number(selectedGoal))
        .catch((error) => console.error("Failed to update daily goal", error))
        .finally(() => {
          window.location.href = `/dashboard?language=${language}&goal=${selectedGoal}`
        })
    }
  }

  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/20 bg-background/95 px-4 py-4 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <Link href="/language-selection">
            <Button variant="ghost" size="icon">
              <ChevronLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold text-foreground">Daily Goal</h1>
          <div className="w-10" />
        </div>
      </header>

      {/* Content */}
      <section className="px-4 py-12">
        <div className="mx-auto max-w-2xl space-y-8">
          <div className="text-center">
            <h2 className="mb-2 text-2xl font-bold text-foreground">
              How much time can you dedicate daily?
            </h2>
            <p className="text-foreground/70">
              You can change this anytime. Start small and build the habit.
            </p>
          </div>

          {/* Goal Cards */}
          <div className="space-y-4">
            {goals.map((goal) => (
              <Card
                key={goal.id}
                className={`cursor-pointer border-2 p-8 text-center transition-all duration-200 ${
                  selectedGoal === goal.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border/30 hover:border-primary/50'
                }`}
                onClick={() => setSelectedGoal(goal.id)}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-center gap-2">
                    <Clock className="h-5 w-5 text-primary" />
                    <span className="text-3xl font-bold text-foreground">
                      {goal.minutes}
                    </span>
                    <span className="text-lg text-foreground/70">min</span>
                  </div>
                  <p className="text-sm text-foreground/60">
                    {goal.description}
                  </p>
                </div>
              </Card>
            ))}
          </div>

          {/* Info Text */}
          <div className="rounded-lg bg-secondary/30 p-4 text-center">
            <p className="text-sm text-foreground/70">
              Consistency beats intensity. Regular practice, no matter the duration, builds stronger skills.
            </p>
          </div>

          {/* Continue Button */}
          <div className="fixed bottom-0 left-0 right-0 border-t border-border/20 bg-background/95 p-4 backdrop-blur-sm">
            <div className="mx-auto max-w-2xl">
              <Button
                size="lg"
                className="w-full gap-2"
                disabled={!selectedGoal}
                onClick={handleContinue}
              >
                Continue
                <ArrowRight className="h-4 w-4" />
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

export default function DailyGoalScreen() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg text-foreground/70">Loading...</div>
        </div>
      </main>
    }>
      <DailyGoalContent />
    </Suspense>
  )
}
