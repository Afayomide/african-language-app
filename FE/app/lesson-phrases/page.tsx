'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ChevronLeft, Headphones } from 'lucide-react'
import { learnerLessonService } from '@/services'

type LessonPhrase = {
  id: string
  text: string
  translation: string
  pronunciation?: string
  explanation?: string
  audio?: { url?: string }
}

export default function LessonPhrasesPage() {
  const searchParams = useSearchParams()
  const lessonIdParam = searchParams.get('lessonId')

  const [lessonId, setLessonId] = useState<string | null>(lessonIdParam)
  const [phrases, setPhrases] = useState<LessonPhrase[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      try {
        const finalLessonId = lessonIdParam || (await learnerLessonService.getNextLesson())?.lesson?.id
        if (!finalLessonId) {
          setPhrases([])
          return
        }
        setLessonId(finalLessonId)
        const payload = await learnerLessonService.getLessonPhrases(finalLessonId)
        setPhrases(payload.phrases || [])
      } catch (error) {
        console.error('Failed to load lesson phrases', error)
        setPhrases([])
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [lessonIdParam])

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border/20 bg-background/95 px-4 py-4 backdrop-blur-sm sticky top-0 z-40">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link href={lessonId ? `/lesson-overview?lessonId=${lessonId}` : '/lesson-overview'}>
            <Button variant="ghost" size="icon">
              <ChevronLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="text-center flex-1">
            <p className="text-sm text-foreground/60">Lesson Phrase Library</p>
            <h1 className="text-xl font-bold text-foreground">Listen Anytime</h1>
          </div>
          <div className="w-10" />
        </div>
      </header>

      <section className="px-4 py-8">
        <div className="mx-auto max-w-3xl space-y-4">
          {isLoading ? (
            <Card className="border border-border/50 p-6 text-center text-foreground/70">Loading phrases...</Card>
          ) : null}

          {!isLoading && phrases.length === 0 ? (
            <Card className="border border-border/50 p-6 text-center text-foreground/70">
              No phrases found for this lesson.
            </Card>
          ) : null}

          {!isLoading && phrases.length > 0 ? (
            phrases.map((phrase) => (
              <Card key={phrase.id} className="border border-border/50 p-5 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xl font-bold text-foreground">{phrase.text}</p>
                    <p className="text-sm text-primary">{phrase.translation}</p>
                    {phrase.pronunciation ? (
                      <p className="text-sm text-foreground/60 mt-1">Pronunciation: {phrase.pronunciation}</p>
                    ) : null}
                    {phrase.explanation ? (
                      <p className="text-sm text-foreground/70 mt-2">{phrase.explanation}</p>
                    ) : null}
                  </div>
                  <Headphones className="h-5 w-5 text-primary" />
                </div>
                {phrase.audio?.url ? (
                  <audio controls src={phrase.audio.url} className="w-full" />
                ) : (
                  <p className="text-xs text-foreground/50">No audio available</p>
                )}
              </Card>
            ))
          ) : null}

          <div className="pt-4">
            <Link href={lessonId ? `/lesson-overview?lessonId=${lessonId}` : '/lesson-overview'}>
              <Button variant="outline" className="w-full">Back to Lesson</Button>
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
