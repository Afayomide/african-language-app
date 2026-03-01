'use client'

import { useEffect, useState, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ChevronLeft, Headphones, Quote, BookOpen, Volume2, Info, Turtle } from 'lucide-react'
import { learnerLessonService } from '@/services'
import { Lesson, Phrase } from '@/types'

function LessonPhrasesContent() {
  const searchParams = useSearchParams()
  const lessonIdParam = searchParams.get('lessonId')

  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [phrases, setPhrases] = useState<Phrase[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      try {
        const finalLessonId = lessonIdParam || (await learnerLessonService.getNextLesson())?.lesson?.id
        if (!finalLessonId) return

        const [lessonData, phrasesData] = await Promise.all([
          learnerLessonService.getLessonOverview(finalLessonId),
          learnerLessonService.getLessonPhrases(finalLessonId)
        ])
        
        setLesson(lessonData.lesson)
        setPhrases(phrasesData.phrases || [])
      } catch (error) {
        console.error('Failed to load lesson materials', error)
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [lessonIdParam])

  const playAudio = (url?: string, speed: number = 1.0) => {
    if (!url) return
    const audio = new Audio(url)
    audio.playbackRate = speed
    audio.play().catch(() => {})
  }

  if (isLoading) return <div className="min-h-screen flex items-center justify-center">Loading materials...</div>
  if (!lesson) return <div className="min-h-screen flex items-center justify-center">Lesson not found.</div>

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border/10 bg-background/95 px-4 py-6 backdrop-blur-sm sticky top-0 z-40">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link href={`/lesson-overview?lessonId=${lesson._id}`}>
            <Button variant="ghost" size="icon" className="rounded-full">
              <ChevronLeft className="h-6 w-6" />
            </Button>
          </Link>
          <div className="text-center flex-1">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-foreground/40">Resource Library</p>
            <h1 className="text-2xl font-black text-foreground tracking-tight">{lesson.title}</h1>
          </div>
          <div className="w-10" />
        </div>
      </header>

      <section className="px-4 py-10">
        <div className="mx-auto max-w-3xl space-y-12">
          
          {/* Phrases Section */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 px-2">
              <BookOpen className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-black uppercase tracking-widest text-foreground/60">Vocabulary Bank</h2>
            </div>
            
            <div className="grid gap-4">
              {phrases.map((phrase, index) => (
                <Card key={phrase._id || index} className="p-6 border-4 border-muted rounded-[2rem] bg-white shadow-sm hover:shadow-md transition-all group">
                  <div className="flex items-center justify-between gap-6">
                    <div className="flex-1 space-y-2">
                      <h3 className="text-2xl font-black text-primary">{phrase.text}</h3>
                      <p className="text-lg font-bold text-foreground/70">{phrase.translation}</p>
                      {phrase.pronunciation && (
                        <p className="text-sm font-medium text-foreground/30 italic">[{phrase.pronunciation}]</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-14 w-14 rounded-2xl bg-primary/5 text-primary group-hover:scale-110 transition-transform"
                        onClick={() => playAudio(phrase.audio?.url)}
                      >
                        <Volume2 className="h-7 w-7" />
                      </Button>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-14 w-14 rounded-2xl bg-secondary/5 text-secondary group-hover:scale-110 transition-transform"
                        onClick={() => playAudio(phrase.audio?.url, 0.6)}
                      >
                        <Turtle className="h-7 w-7" />
                      </Button>
                    </div>
                  </div>
                  {phrase.explanation && (
                    <div className="mt-4 pt-4 border-t border-muted flex gap-3 text-sm text-muted-foreground font-medium italic">
                      <Info className="h-4 w-4 shrink-0" />
                      <p>{phrase.explanation}</p>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </div>

          {/* Proverbs Section */}
          {lesson.proverbs && lesson.proverbs.length > 0 && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 px-2">
                <Quote className="h-5 w-5 text-amber-600" />
                <h2 className="text-lg font-black uppercase tracking-widest text-foreground/60">Cultural Proverbs</h2>
              </div>
              
              <div className="grid gap-4">
                {lesson.proverbs.map((proverb, idx) => (
                  <Card key={idx} className="p-8 border-4 border-amber-100 rounded-[2rem] bg-amber-50/50 shadow-sm relative overflow-hidden group">
                    <Quote className="absolute -top-2 -left-2 h-16 w-16 text-amber-100/50 -rotate-12" />
                    <div className="relative z-10 space-y-4">
                      <h3 className="text-xl font-black text-amber-900 leading-tight">"{proverb.text}"</h3>
                      <div className="h-0.5 w-12 bg-amber-200" />
                      <p className="font-bold text-amber-800/70 italic">{proverb.translation}</p>
                      {proverb.contextNote && (
                        <div className="mt-4 p-4 rounded-xl bg-white/50 border border-amber-100 text-sm text-amber-900/60 leading-relaxed font-medium">
                          {proverb.contextNote}
                        </div>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          <div className="pt-8">
            <Link href={`/lesson-overview?lessonId=${lesson._id}`}>
              <Button variant="outline" className="w-full h-14 rounded-2xl border-4 font-black text-lg hover:bg-muted transition-all">
                Back to Unit
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}

export default function LessonPhrasesPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center font-bold">Loading Materials...</div>}>
      <LessonPhrasesContent />
    </Suspense>
  )
}
