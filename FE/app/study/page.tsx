'use client'

import { useEffect, useState, Suspense, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ChevronLeft, Check, X, Volume2, ArrowRight, Info, BookOpen, Quote, Mic, Turtle } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { learnerLessonService } from '@/services'
import { Lesson, Phrase, ExerciseQuestion, PopulatedLessonBlock } from '@/types'
import { cn } from '@/lib/utils'

// Sound Effect URLs
const SOUNDS = {
  correct: 'https://d1490khl9ot1x.cloudfront.net/sounds/correct.mp3',
  incorrect: 'https://d1490khl9ot1x.cloudfront.net/sounds/incorrect.mp3',
  click: 'https://d1490khl9ot1x.cloudfront.net/sounds/click.mp3'
}

function StudyPageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const lessonId = searchParams.get("lessonId")
  
  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [blocks, setBlocks] = useState<PopulatedLessonBlock[]>([])
  const [currentBlockIndex, setCurrentBlockIndex] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  
  // Exercise State
  const [selectedOption, setSelectedAnswer] = useState<number | null>(null)
  const [selectedWords, setSelectedWords] = useState<number[]>([])
  const [isAnswered, setIsAnswered] = useState(false)
  const [isCorrect, setIsCorrect] = useState(false)
  const [score, setScore] = useState(0)
  const [isListening, setIsListening] = useState(false) // For Mic

  useEffect(() => {
    if (!lessonId) {
      router.push('/dashboard')
      return
    }

    setIsLoading(true)
    learnerLessonService.getLessonFlow(lessonId)
      .then((data) => {
        console.log(data)
        setLesson(data.lesson)
        setBlocks(data.blocks || [])
      })
      .catch((err) => {
        console.error("Failed to load lesson flow", err)
        router.push('/dashboard')
      })
      .finally(() => setIsLoading(false))
  }, [lessonId, router])

  const currentBlock = blocks[currentBlockIndex]
  const progress = blocks.length > 0 ? Math.round(((currentBlockIndex) / blocks.length) * 100) : 0

  const playFeedbackSound = useCallback((type: 'correct' | 'incorrect') => {
    const audio = new Audio(SOUNDS[type])
    audio.volume = 0.4
    audio.play().catch(() => {})
  }, [])

  const playAudio = useCallback((url?: string, speed: number = 1.0) => {
    if (!url) return
    const audio = new Audio(url)
    audio.playbackRate = speed
    audio.play().catch(e => console.error("Audio playback failed", e))
  }, [])

  const handleCheck = () => {
    if (!currentBlock || !currentBlock.data) return
    const data = currentBlock.data as ExerciseQuestion & { interactionData?: any }
    
    let correct = false
    if (data.type === "fill-in-the-gap" || currentBlock.subtype?.includes("fg-word-order")) {
      const correctOrder = data.interactionData?.correctOrder || []
      correct = selectedWords.join(',') === correctOrder.join(',')
    } else {
      correct = selectedOption === data.correctIndex
    }

    setIsCorrect(correct)
    setIsAnswered(true)
    playFeedbackSound(correct ? 'correct' : 'incorrect')
    if (correct) setScore(s => s + 1)
  }

  const handleNext = async () => {
    if (currentBlockIndex < blocks.length - 1) {
      setCurrentBlockIndex(prev => prev + 1)
      setSelectedAnswer(null)
      setSelectedWords([])
      setIsAnswered(false)
      setIsCorrect(false)
    } else {
      try {
        if (lessonId) {
          await learnerLessonService.completeLesson(lessonId, { 
            xpEarned: 50 + (score * 10),
            minutesSpent: 10 
          })
        }
        router.push(`/lesson-complete?lessonId=${lessonId}`)
      } catch (err) {
        console.error("Failed to complete lesson", err)
        router.push('/dashboard')
      }
    }
  }

  const toggleMic = () => {
    setIsListening(!isListening)
    // Future: Integrate webkitSpeechRecognition here
    if (!isListening) {
      setTimeout(() => setIsListening(false), 3000) // Simulate listening
    }
  }

  if (isLoading) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
      <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
      <p className="text-xl font-bold text-foreground/60 animate-pulse">Preparing your lesson...</p>
    </div>
  )

  if (!currentBlock) return <div className="min-h-screen flex items-center justify-center">No content available.</div>

  return (
    <main className="min-h-screen bg-background flex flex-col select-none">
      {/* Duolingo-style Header */}
      <header className="px-4 h-20 flex items-center bg-background sticky top-0 z-50">
        <div className="max-w-4xl mx-auto w-full flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => router.push(`/lesson-overview?lessonId=${lessonId}`)}
            className="rounded-full text-foreground/40 hover:text-foreground"
          >
            <X className="h-8 w-8" />
          </Button>
          <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden border-2 border-muted">
            <div 
              className="h-full bg-primary transition-all duration-700 cubic-bezier(0.65, 0, 0.35, 1)"
              style={{ width: `${progress}%` }}
            />
            <div className="absolute inset-0 bg-white/20 h-1/2" />
          </div>
          <div className="flex items-center gap-1 px-3 py-1 rounded-full bg-primary/10 border border-primary/20">
            <span className="text-sm font-black text-primary">🔥 3</span>
          </div>
        </div>
      </header>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto pt-8 pb-32">
        <div className="max-w-2xl mx-auto px-6 h-full flex flex-col">
          
          {/* Text Block (Tip) */}
          {currentBlock.type === "text" && (
            <div className="space-y-8 py-10 animate-in fade-in zoom-in-95 duration-500">
              <div className="flex items-center gap-4 mb-4">
                <div className="h-16 w-16 rounded-2xl bg-blue-500 shadow-lg shadow-blue-500/30 flex items-center justify-center text-white">
                  <Info className="h-8 w-8" />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-foreground">Teacher's Note</h2>
                  <p className="text-muted-foreground font-medium uppercase tracking-widest text-xs">Cultural Context</p>
                </div>
              </div>
              <div className="text-2xl text-foreground font-medium leading-relaxed bg-blue-50 p-10 rounded-[2.5rem] border-4 border-blue-100 shadow-inner">
                {currentBlock.content}
              </div>
            </div>
          )}

          {/* Phrase Block (Learning) */}
          {currentBlock.type === "phrase" && (
            <div className="space-y-10 py-10 animate-in fade-in slide-in-from-bottom-8 duration-500">
              <div className="text-center space-y-4">
                <h2 className="text-xl font-black text-foreground/40 uppercase tracking-[0.2em]">New Expression</h2>
                <div className="h-1 w-12 bg-primary mx-auto rounded-full" />
              </div>

              <div className="bg-white border-4 border-muted rounded-[3.5rem] p-12 shadow-2xl shadow-primary/5 flex flex-col items-center gap-8 relative">
                <div className="flex gap-4">
                  <Button 
                    size="lg" 
                    className="h-20 w-20 rounded-[1.5rem] bg-primary shadow-lg shadow-primary/30 hover:scale-105 active:scale-95 transition-all"
                    onClick={() => playAudio(currentBlock.data?.audio?.url)}
                  >
                    <Volume2 className="h-10 w-10" />
                  </Button>
                  <Button 
                    size="lg" 
                    variant="outline"
                    className="h-20 w-20 rounded-[1.5rem] border-4 border-muted hover:bg-muted active:scale-95 transition-all text-foreground/40"
                    onClick={() => playAudio(currentBlock.data?.audio?.url, 0.6)}
                  >
                    <Turtle className="h-10 w-10" />
                  </Button>
                </div>

                <div className="text-center space-y-4">
                  <h3 className="text-6xl font-black text-primary tracking-tight">{currentBlock.data.text}</h3>
                  {currentBlock.data.pronunciation && (
                    <p className="text-2xl text-foreground/30 font-bold italic tracking-wide">
                      {currentBlock.data.pronunciation}
                    </p>
                  )}
                </div>

                <div className="w-full h-1 bg-muted/50 rounded-full" />

                <p className="text-3xl font-black text-foreground/80">{currentBlock.data.translation}</p>
              </div>

              <div className="flex justify-center gap-4">
                <Button 
                  variant="outline" 
                  className={cn(
                    "h-16 px-8 rounded-2xl border-4 font-black text-lg transition-all",
                    isListening ? "bg-red-50 border-red-500 text-red-600 animate-pulse" : "border-muted text-foreground/40"
                  )}
                  onClick={toggleMic}
                >
                  <Mic className={cn("mr-2 h-6 w-6", isListening && "fill-current")} />
                  {isListening ? "Listening..." : "Practice Speaking"}
                </Button>
              </div>
            </div>
          )}

          {/* Proverb Block */}
          {currentBlock.type === "proverb" && (
            <div className="space-y-10 py-10 animate-in fade-in slide-in-from-bottom-8 duration-500">
              <div className="text-center space-y-4">
                <h2 className="text-xl font-black text-amber-600/40 uppercase tracking-[0.2em]">Yoruba Wisdom</h2>
                <div className="h-1 w-12 bg-amber-500 mx-auto rounded-full" />
              </div>

              <div className="bg-amber-50 border-4 border-amber-200 rounded-[3.5rem] p-12 shadow-2xl shadow-amber-500/5 relative overflow-hidden">
                <Quote className="absolute -top-4 -left-4 h-24 w-24 text-amber-200/50 -rotate-12" />
                <div className="relative z-10 space-y-8">
                  <h3 className="text-4xl font-black text-amber-900 leading-[1.3]">{currentBlock.data.text}</h3>
                  <div className="h-1 w-24 bg-amber-200" />
                  <p className="text-2xl font-bold text-amber-800/70 italic">{currentBlock.data.translation}</p>
                </div>
              </div>

              {currentBlock.data.contextNote && (
                <div className="bg-secondary/10 p-8 rounded-[2rem] border-2 border-secondary/20 flex gap-4">
                  <Info className="h-8 w-8 text-secondary shrink-0" />
                  <p className="text-lg font-medium text-foreground/70 leading-relaxed">{currentBlock.data.contextNote}</p>
                </div>
              )}
            </div>
          )}

          {/* Exercise Block (MC or FG) */}
          {(currentBlock.type === "question" || currentBlock.type === "listening") && (
            <div className="space-y-10 py-6 animate-in fade-in duration-500">
              <div className="space-y-6">
                <h2 className="text-3xl font-black text-foreground leading-tight">
                  {currentBlock.type === "listening" ? "What did you hear?" : currentBlock.data.prompt}
                </h2>
                
                {currentBlock.type === "listening" && (
                  <div className="flex gap-4 py-4">
                    <Button 
                      size="lg" 
                      className="h-24 w-24 rounded-3xl bg-primary shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
                      onClick={() => playAudio(currentBlock.data?.phrase?.audio?.url)}
                    >
                      <Volume2 className="h-12 w-12" />
                    </Button>
                    <Button 
                      size="lg" 
                      variant="outline"
                      className="h-24 w-24 rounded-3xl border-4 border-muted text-foreground/40 active:scale-95 transition-all"
                      onClick={() => playAudio(currentBlock.data?.phrase?.audio?.url, 0.6)}
                    >
                      <Turtle className="h-12 w-12" />
                    </Button>
                  </div>
                )}
              </div>

              {/* Interaction: Multiple Choice */}
              {currentBlock.type !== "text" && currentBlock.type !== "phrase" && currentBlock.type !== "proverb" && 
               (currentBlock.data.type === "multiple-choice" || currentBlock.data.subtype?.includes("mc") || currentBlock.data.subtype === "ls-mc-select-translation") && (
                <div className="grid gap-4">
                  {currentBlock.data.options.map((option: string, idx: number) => (
                    <Button
                      key={idx}
                      variant="outline"
                      className={cn(
                        "h-auto p-6 text-left justify-start text-xl font-bold border-4 rounded-[1.5rem] transition-all relative overflow-hidden group",
                        selectedOption === idx && !isAnswered && "border-primary bg-primary/5 text-primary shadow-lg",
                        isAnswered && idx === currentBlock.data.correctIndex && "border-green-500 bg-green-50 text-green-700",
                        isAnswered && selectedOption === idx && idx !== currentBlock.data.correctIndex && "border-red-500 bg-red-50 text-red-700"
                      )}
                      onClick={() => {
                        if (!isAnswered) {
                          setSelectedAnswer(idx)
                          new Audio(SOUNDS.click).play().catch(() => {})
                        }
                      }}
                      disabled={isAnswered}
                    >
                      <span className="mr-6 flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-base font-black group-hover:bg-primary/10 transition-colors">
                        {idx + 1}
                      </span>
                      {option}
                    </Button>
                  ))}
                </div>
              )}

              {/* Interaction: Word Order */}
              {currentBlock.type !== "text" && currentBlock.type !== "phrase" && currentBlock.type !== "proverb" && 
               (currentBlock.data.type === "fill-in-the-gap" || currentBlock.data.subtype?.includes("fg")) && (
                <div className="space-y-12">
                  <div className="min-h-[160px] p-8 bg-muted/20 border-4 border-dashed border-muted rounded-[2.5rem] flex flex-wrap gap-4 items-center content-center justify-center shadow-inner">
                    {selectedWords.length === 0 && !isAnswered && (
                      <span className="text-xl font-bold text-foreground/20 italic uppercase tracking-widest">Select words below</span>
                    )}
                    {selectedWords.map((wordIdx, idx) => (
                      <Button
                        key={`${wordIdx}-${idx}`}
                        variant="secondary"
                        className="h-14 px-8 rounded-2xl font-black text-xl shadow-lg border-b-4 border-muted-foreground/30 animate-in zoom-in-90 active:translate-y-1 active:border-b-0 transition-all"
                        onClick={() => !isAnswered && setSelectedWords(prev => prev.filter((_, i) => i !== idx))}
                        disabled={isAnswered}
                      >
                        {currentBlock.data.interactionData.words[wordIdx]}
                      </Button>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-4 justify-center">
                    {currentBlock.data.interactionData.words.map((word: string, idx: number) => {
                      const isUsed = selectedWords.includes(idx)
                      return (
                        <div key={idx} className="relative">
                          <div className="h-14 px-8 rounded-2xl bg-muted/30 border-4 border-transparent opacity-50" />
                          <Button
                            variant="outline"
                            className={cn(
                              "h-14 px-8 rounded-2xl font-black text-xl border-4 border-muted border-b-8 absolute inset-0 transition-all active:translate-y-1 active:border-b-4 shadow-sm",
                              isUsed ? "opacity-0 scale-90 pointer-events-none" : "hover:border-primary/50"
                            )}
                            onClick={() => {
                              if (!isAnswered) {
                                setSelectedWords(prev => [...prev, idx])
                                new Audio(SOUNDS.click).play().catch(() => {})
                              }
                            }}
                            disabled={isAnswered}
                          >
                            {word}
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Persistent Bottom Bar */}
      <footer className={cn(
        "h-32 px-6 border-t-4 transition-all duration-500",
        !isAnswered ? "bg-background border-muted" : (isCorrect ? "bg-green-100 border-green-200" : "bg-red-100 border-red-200")
      )}>
        <div className="max-w-4xl mx-auto h-full flex items-center justify-between gap-6">
          <div className="flex-1 hidden md:block">
            {isAnswered && (
              <div className={cn(
                "flex items-center gap-6 animate-in slide-in-from-bottom-4",
                isCorrect ? "text-green-800" : "text-red-800"
              )}>
                <div className={cn(
                  "h-20 w-20 rounded-[1.5rem] flex items-center justify-center shrink-0 border-b-8",
                  isCorrect ? "bg-white border-green-300" : "bg-white border-red-300"
                )}>
                  {isCorrect ? <Check className="h-12 w-12" /> : <X className="h-12 w-12" />}
                </div>
                <div className="space-y-1">
                  <h4 className="text-3xl font-black">{isCorrect ? "Correct!" : "Incorrect"}</h4>
                  {!isCorrect && currentBlock.data.explanation && (
                    <p className="text-lg font-bold opacity-70">{currentBlock.data.explanation}</p>
                  )}
                </div>
              </div>
            )}
          </div>
          
          <div className="w-full md:w-auto">
            {!isAnswered ? (
              <Button 
                size="lg" 
                className="w-full md:w-auto h-16 px-16 rounded-2xl text-xl font-black shadow-xl border-b-8 border-primary-foreground/30 active:translate-y-1 active:border-b-4 transition-all disabled:bg-muted disabled:text-foreground/20 disabled:border-muted"
                onClick={handleCheck}
                disabled={
                  (currentBlock.type === "question" || currentBlock.type === "listening") && 
                  selectedOption === null && 
                  selectedWords.length === 0
                }
              >
                Check Answer
              </Button>
            ) : (
              <Button 
                size="lg" 
                className={cn(
                  "w-full md:w-auto h-16 px-16 rounded-2xl text-xl font-black shadow-xl border-b-8 active:translate-y-1 active:border-b-4 transition-all animate-in zoom-in-95",
                  isCorrect ? "bg-green-600 border-green-800 hover:bg-green-700" : "bg-red-600 border-red-800 hover:bg-red-700"
                )}
                onClick={handleNext}
              >
                Continue
                <ArrowRight className="ml-2 h-8 w-8" />
              </Button>
            )}

            {/* Non-exercise Continue */}
            {currentBlock.type !== "question" && currentBlock.type !== "listening" && (
              <Button 
                size="lg" 
                className="w-full md:w-auto h-16 px-16 rounded-2xl text-xl font-black shadow-xl border-b-8 border-primary-foreground/30 active:translate-y-1 active:border-b-4"
                onClick={handleNext}
              >
                Continue
                <ArrowRight className="ml-2 h-8 w-8" />
              </Button>
            )}
          </div>
        </div>
      </footer>
    </main>
  )
}

export default function StudyPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center font-bold text-primary">Studying...</div>}>
      <StudyPageContent />
    </Suspense>
  )
}
