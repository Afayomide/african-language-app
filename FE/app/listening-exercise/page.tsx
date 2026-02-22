'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ChevronLeft, Play, RotateCcw, Check, X } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { learnerLessonService } from '@/services'

const listeningExercises = [
  {
    id: 1,
    prompt: 'Listen and choose the correct meaning',
    audioLabel: 'Ẹ káàrọ̀',
    options: ['Good morning', 'Good evening', 'Hello', 'Goodbye'],
    correct: 0,
    explanation: 'This is a respectful Yoruba morning greeting.',
  },
  {
    id: 2,
    prompt: 'What did you hear?',
    audioLabel: 'E se o',
    options: ['Thank you', 'Please', 'Excuse me', 'Sorry'],
    correct: 0,
    explanation: "'E se o' expresses deep gratitude in Yoruba.",
  },
  {
    id: 3,
    prompt: 'Listen to the greeting',
    audioLabel: 'Sannu',
    options: ['Hello', 'Goodbye', 'Thank you', 'Please'],
    correct: 0,
    explanation: "'Sannu' is a warm Hausa greeting.",
  },
]

export default function ListeningExerciseScreen() {
  const searchParams = useSearchParams()
  const lessonId = searchParams.get("lessonId")
  const [currentExercise, setCurrentExercise] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null)
  const [answered, setAnswered] = useState(false)
  const [isCorrect, setIsCorrect] = useState(false)
  const [played, setPlayed] = useState(false)

  const exercise = listeningExercises[currentExercise]

  const handlePlayAudio = () => {
    setPlayed(true)
    // In a real app, you would play audio here
    // For now, we'll just simulate the interaction
  }

  const handleSelectAnswer = (index: number) => {
    if (!answered) {
      setSelectedAnswer(index)
    }
  }

  const handleCheck = () => {
    if (selectedAnswer !== null) {
      const correct = selectedAnswer === exercise.correct
      setIsCorrect(correct)
      setAnswered(true)
    }
  }

  const handleNext = () => {
    if (currentExercise < listeningExercises.length - 1) {
      setCurrentExercise(currentExercise + 1)
      setSelectedAnswer(null)
      setAnswered(false)
      setPlayed(false)
    } else {
      if (lessonId) {
        learnerLessonService.completeStep(lessonId, "listening").catch((error) => {
          console.error("Failed to update listening progress", error)
        })
      }
      window.location.href = lessonId ? `/lesson-phrases?lessonId=${lessonId}` : '/lesson-phrases'
    }
  }

  const handleReset = () => {
    setSelectedAnswer(null)
    setAnswered(false)
    setPlayed(false)
  }

  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/20 bg-background/95 px-4 py-4 backdrop-blur-sm sticky top-0 z-40">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <Link href="/lesson-overview">
            <Button variant="ghost" size="icon">
              <ChevronLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="text-center flex-1">
            <p className="text-sm text-foreground/60">
              Exercise {currentExercise + 1}/{listeningExercises.length}
            </p>
          </div>
          <div className="w-10" />
        </div>
      </header>

      {/* Content */}
      <section className="px-4 py-8">
        <div className="mx-auto max-w-2xl space-y-8">
          {/* Progress Bar */}
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{
                width: `${((currentExercise + 1) / listeningExercises.length) * 100}%`,
              }}
            />
          </div>

          {/* Prompt */}
          <Card className="border border-border/50 p-6 text-center">
            <p className="text-foreground/70 mb-2">{exercise.prompt}</p>
          </Card>

          {/* Audio Player */}
          <div className="flex flex-col items-center gap-6">
            <div className="text-5xl font-bold text-primary">
              {exercise.audioLabel}
            </div>
            <Button
              size="lg"
              className="h-16 w-16 rounded-full p-0 gap-2"
              onClick={handlePlayAudio}
              disabled={answered}
            >
              <Play className="h-6 w-6 fill-current" />
            </Button>
            <p className="text-sm text-foreground/60">
              {played ? 'Listen and choose an answer below' : 'Click play to hear the audio'}
            </p>
          </div>

          {/* Answer Options */}
          {played && (
            <div className="space-y-3">
              {exercise.options.map((option, index) => {
                let borderColor = 'border-border/30'
                let bgColor = ''

                if (answered) {
                  if (index === exercise.correct) {
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
                          {index === exercise.correct && (
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
          )}

          {/* Explanation */}
          {answered && (
            <Card
              className={`border-2 p-4 ${
                isCorrect ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
              }`}
            >
              <div className="flex gap-3">
                <div>
                  {isCorrect ? (
                    <Check className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <X className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                  )}
                </div>
                <div>
                  <p
                    className={`font-semibold ${
                      isCorrect ? 'text-green-900' : 'text-red-900'
                    }`}
                  >
                    {isCorrect ? 'Correct!' : 'Not quite right'}
                  </p>
                  <p
                    className={`mt-1 text-sm ${
                      isCorrect ? 'text-green-800' : 'text-red-800'
                    }`}
                  >
                    {exercise.explanation}
                  </p>
                </div>
              </div>
            </Card>
          )}

          {/* Action Buttons */}
          <div className="fixed bottom-0 left-0 right-0 border-t border-border/20 bg-background/95 p-4 backdrop-blur-sm">
            <div className="mx-auto max-w-2xl flex gap-3">
              {answered ? (
                <Button
                  size="lg"
                  className="w-full"
                  onClick={handleNext}
                >
                  {currentExercise === listeningExercises.length - 1
                    ? 'See Results'
                    : 'Next Exercise'}
                </Button>
              ) : played && selectedAnswer !== null ? (
                <>
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={handleReset}
                  >
                    Reset
                  </Button>
                  <Button
                    size="lg"
                    className="w-full"
                    onClick={handleCheck}
                  >
                    Check Answer
                  </Button>
                </>
              ) : null}
            </div>
          </div>

          {/* Spacer */}
          <div className="h-24" />
        </div>
      </section>
    </main>
  )
}
