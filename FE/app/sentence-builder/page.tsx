'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ChevronLeft, RotateCcw, Check, X } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { learnerLessonService } from '@/services'

type ReviewExercise = {
  id: string
  prompt: string
  sentence: string
  words: string[]
  correctOrder: number[]
  meaning: string
}

export default function SentenceBuilderScreen() {
  const searchParams = useSearchParams()
  const lessonId = searchParams.get('lessonId')

  const [exercises, setExercises] = useState<ReviewExercise[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [currentExercise, setCurrentExercise] = useState(0)
  const [selectedWords, setSelectedWords] = useState<number[]>([])
  const [answered, setAnswered] = useState(false)
  const [isCorrect, setIsCorrect] = useState(false)
  const [score, setScore] = useState(0)

  useEffect(() => {
    if (!lessonId) {
      setIsLoading(false)
      setExercises([])
      return
    }

    setIsLoading(true)
    learnerLessonService
      .getLessonReviewExercises(lessonId)
      .then((payload) => setExercises(payload.exercises || []))
      .catch((error) => {
        console.error('Failed to load review exercises', error)
        setExercises([])
      })
      .finally(() => setIsLoading(false))
  }, [lessonId])

  const exercise = exercises[currentExercise]

  const handleSelectWord = (index: number) => {
    if (!answered && !selectedWords.includes(index)) {
      setSelectedWords([...selectedWords, index])
    }
  }

  const handleRemoveWord = (selectedIndex: number) => {
    if (!answered) {
      setSelectedWords(selectedWords.filter((_, index) => index !== selectedIndex))
    }
  }

  const handleReset = () => {
    setSelectedWords([])
    setAnswered(false)
    setIsCorrect(false)
  }

  const handleCheck = () => {
    if (!exercise) return
    const correct = selectedWords.join(',') === exercise.correctOrder.join(',')
    setIsCorrect(correct)
    setAnswered(true)
    if (correct) setScore((prev) => prev + 1)
  }

  const handleNext = () => {
    if (!exercise) return
    if (currentExercise < exercises.length - 1) {
      setCurrentExercise(currentExercise + 1)
      handleReset()
      return
    }

    if (lessonId) {
      learnerLessonService.completeStep(lessonId, 'review', score).catch((error) => {
        console.error('Failed to update review progress', error)
      })
    }
    window.location.href = lessonId ? `/lesson-complete?lessonId=${lessonId}` : '/lesson-complete'
  }

  if (isLoading) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-foreground/70">Loading review exercises...</div>
      </main>
    )
  }

  if (!exercise) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-foreground/70">No review exercises published for this lesson yet.</p>
          <Link href={lessonId ? `/lesson-overview?lessonId=${lessonId}` : '/lesson-overview'}>
            <Button variant="outline">Back to lesson</Button>
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border/20 bg-background/95 px-4 py-4 backdrop-blur-sm sticky top-0 z-40">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <Link href={lessonId ? `/lesson-overview?lessonId=${lessonId}` : '/lesson-overview'}>
            <Button variant="ghost" size="icon">
              <ChevronLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="text-center flex-1">
            <p className="text-sm text-foreground/60">Sentence {currentExercise + 1}/{exercises.length}</p>
          </div>
          <div className="text-sm font-medium text-primary">{score}/{exercises.length}</div>
        </div>
      </header>

      <section className="px-4 py-8">
        <div className="mx-auto max-w-2xl space-y-8">
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${((currentExercise + 1) / exercises.length) * 100}%` }}
            />
          </div>

          <Card className="border border-border/50 p-6">
            <p className="text-sm text-foreground/70 mb-2">{exercise.prompt}</p>
            <h2 className="text-lg font-bold text-foreground">{exercise.sentence}</h2>
            <p className="text-sm text-primary mt-3 font-medium">= {exercise.meaning}</p>
          </Card>

          <Card className="border-2 border-dashed border-border/50 p-6 min-h-[100px] flex items-center justify-center">
            {selectedWords.length === 0 ? (
              <p className="text-center text-foreground/50">Tap words below to arrange them here</p>
            ) : (
              <div className="flex flex-wrap gap-2 justify-center w-full">
                {selectedWords.map((wordIndex, selectedIndex) => (
                  <Button
                    key={`${wordIndex}-${selectedIndex}`}
                    onClick={() => handleRemoveWord(selectedIndex)}
                    variant="secondary"
                    className="gap-2"
                    disabled={answered}
                  >
                    {exercise.words[wordIndex]}
                    {!answered && <X className="h-3 w-3" />}
                  </Button>
                ))}
              </div>
            )}
          </Card>

          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground/70">Available words:</p>
            <div className="flex flex-wrap gap-2">
              {exercise.words.map((word, index) => (
                <Button
                  key={`${word}-${index}`}
                  onClick={() => handleSelectWord(index)}
                  variant={selectedWords.includes(index) ? 'default' : 'outline'}
                  disabled={answered || selectedWords.includes(index)}
                  className={selectedWords.includes(index) ? 'opacity-50' : ''}
                >
                  {word}
                </Button>
              ))}
            </div>
          </div>

          {answered ? (
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
                    {isCorrect ? 'Perfect!' : 'Try again'}
                  </p>
                  <p className={`mt-1 text-sm ${isCorrect ? 'text-green-800' : 'text-red-800'}`}>
                    {`Correct order: ${exercise.correctOrder.map((i) => exercise.words[i]).join(' ')}`}
                  </p>
                </div>
              </div>
            </Card>
          ) : null}

          <div className="fixed bottom-0 left-0 right-0 border-t border-border/20 bg-background/95 p-4 backdrop-blur-sm">
            <div className="mx-auto max-w-2xl flex gap-3">
              {answered ? (
                <Button size="lg" className="w-full" onClick={handleNext}>
                  {currentExercise === exercises.length - 1 ? 'See Results' : 'Next Sentence'}
                </Button>
              ) : (
                <>
                  <Button size="lg" variant="outline" className="gap-2 bg-transparent" onClick={handleReset}>
                    <RotateCcw className="h-4 w-4" />
                    Reset
                  </Button>
                  <Button size="lg" className="w-full" disabled={selectedWords.length !== exercise.words.length} onClick={handleCheck}>
                    Check
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="h-24" />
        </div>
      </section>
    </main>
  )
}
