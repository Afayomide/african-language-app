'use client'

import { useEffect, useState, Suspense } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ChevronLeft, Check, X } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { learnerLessonService } from '@/services'

type ExerciseQuestion = {
  id: string
  prompt: string
  options: string[]
  correctIndex: number
  explanation: string
  phrase?: {
    _id: string
    text: string
    translation: string
    audio?: { url?: string }
  }
}

function ExerciseContent() {
  const searchParams = useSearchParams()
  const lessonId = searchParams.get("lessonId")
  const stepType = searchParams.get("type") || "vocabulary"
  const [questions, setQuestions] = useState<ExerciseQuestion[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [currentQuestion, setCurrentQuestion] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null)
  const [answered, setAnswered] = useState(false)
  const [score, setScore] = useState(0)

  useEffect(() => {
    if (!lessonId) {
      setQuestions([])
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    learnerLessonService
      .getLessonQuestions(lessonId, stepType)
      .then((payload) => setQuestions(payload.questions || []))
      .catch((error) => {
        console.error("Failed to load questions", error)
        setQuestions([])
      })
      .finally(() => setIsLoading(false))
  }, [lessonId, stepType])

  const question = questions[currentQuestion]
  const totalQuestions = questions.length
  const isCorrect = question ? selectedAnswer === question.correctIndex : false

  const handleSelectAnswer = (index: number) => {
    if (!answered) {
      setSelectedAnswer(index)
    }
  }

  const handleCheck = () => {
    if (!question) return
    if (selectedAnswer !== null) {
      setAnswered(true)
      if (isCorrect) {
        setScore(score + 1)
      }
    }
  }

  const handleNext = () => {
    if (currentQuestion < totalQuestions - 1) {
      setCurrentQuestion(currentQuestion + 1)
      setSelectedAnswer(null)
      setAnswered(false)
    } else {
      if (lessonId) {
        learnerLessonService.completeStep(lessonId, stepType, score).catch((error) => {
          console.error("Failed to update step progress", error)
        })
      }
      window.location.href = lessonId ? `/lesson-complete?lessonId=${lessonId}` : '/lesson-complete'
    }
  }

  return (
    <main className="min-h-screen bg-background">
      {isLoading ? (
        <section className="px-4 py-8"><div className="mx-auto max-w-2xl text-center text-foreground/70">Loading questions...</div></section>
      ) : null}
      {!isLoading && questions.length === 0 ? (
        <section className="px-4 py-8"><div className="mx-auto max-w-2xl text-center text-foreground/70">No questions published yet for this lesson step.</div></section>
      ) : null}
      {!isLoading && questions.length > 0 && question ? (
      <>
      {/* Header */}
      <header className="border-b border-border/20 bg-background/95 px-4 py-4 backdrop-blur-sm sticky top-0 z-40">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <Link href="/lesson-overview">
            <Button variant="ghost" size="icon">
              <ChevronLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="text-center flex-1">
            <p className="text-sm text-foreground/60">Question {currentQuestion + 1}/{totalQuestions}</p>
          </div>
          <div className="text-sm font-medium text-primary">{score}/{totalQuestions}</div>
        </div>
      </header>

      {/* Content */}
      <section className="px-4 py-8">
        <div className="mx-auto max-w-2xl space-y-8">
          {/* Progress Bar */}
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${((currentQuestion + 1) / totalQuestions) * 100}%` }}
            />
          </div>

          {/* Question */}
          <Card className="border border-border/50 p-6">
            <h2 className="text-xl font-bold text-foreground">
              {question.prompt}
            </h2>
            {question.phrase?.audio?.url ? (
              <div className="mt-4">
                <audio controls src={question.phrase.audio.url} className="w-full" />
              </div>
            ) : null}
          </Card>

          {/* Answer Options */}
          <div className="space-y-3">
            {question.options.map((option, index) => {
              let borderColor = 'border-border/30'
              let bgColor = ''

              if (answered) {
                if (index === question.correctIndex) {
                  borderColor = 'border-green-500'
                  bgColor = 'bg-green-50'
                } else if (index === selectedAnswer && !isCorrect) {
                  borderColor = 'border-red-500'
                  bgColor = 'bg-red-50'
                }
              } else if (index === selectedAnswer) {
                borderColor = 'border-primary'
                bgColor = 'bg-primary/5'
              }

              return (
                <Card
                  key={index}
                  className={`cursor-pointer border-2 p-4 transition-all ${borderColor} ${bgColor} ${
                    answered ? 'cursor-not-allowed' : 'hover:border-primary/50'
                  }`}
                  onClick={() => handleSelectAnswer(index)}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">{option}</span>
                    {answered && (
                      <div>
                        {index === question.correctIndex && (
                          <Check className="h-5 w-5 text-green-500" />
                        )}
                        {index === selectedAnswer && !isCorrect && (
                          <X className="h-5 w-5 text-red-500" />
                        )}
                      </div>
                    )}
                  </div>
                </Card>
              )
            })}
          </div>

          {/* Explanation */}
          {answered && (
            <Card className={`border-2 p-4 ${isCorrect ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
              <div className="flex gap-3">
                <div>
                  {isCorrect ? (
                    <Check className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <X className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                  )}
                </div>
                <div>
                  <p className={`font-semibold ${isCorrect ? 'text-green-900' : 'text-red-900'}`}>
                    {isCorrect ? 'Correct!' : 'Not quite right'}
                  </p>
                  <p className={`mt-1 text-sm ${isCorrect ? 'text-green-800' : 'text-red-800'}`}>
                    {question.explanation}
                  </p>
                </div>
              </div>
            </Card>
          )}

          {/* Action Buttons */}
          <div className="fixed bottom-0 left-0 right-0 border-t border-border/20 bg-background/95 p-4 backdrop-blur-sm">
            <div className="mx-auto max-w-2xl flex gap-3">
              {!answered ? (
                <Button
                  size="lg"
                  className="w-full"
                  disabled={selectedAnswer === null}
                  onClick={handleCheck}
                >
                  Check Answer
                </Button>
              ) : (
                <Button
                  size="lg"
                  className="w-full"
                  onClick={handleNext}
                >
                  {currentQuestion === totalQuestions - 1 ? 'See Results' : 'Next Question'}
                </Button>
              )}
            </div>
          </div>

          {/* Spacer */}
          <div className="h-24" />
        </div>
      </section>
      </>
      ) : null}
    </main>
  )
}

export default function ExerciseScreen() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg text-foreground/70">Loading exercise...</div>
        </div>
      </main>
    }>
      <ExerciseContent />
    </Suspense>
  )
}
