'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function ListeningExerciseRedirectContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const lessonId = searchParams.get('lessonId')

  useEffect(() => {
    if (!lessonId) {
      router.replace('/dashboard')
      return
    }
    router.replace(`/study?lessonId=${lessonId}`)
  }, [lessonId, router])

  return (
    <main className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-foreground/70">Opening lesson...</div>
    </main>
  )
}

export default function ListeningExercisePage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-background" />}>
      <ListeningExerciseRedirectContent />
    </Suspense>
  )
}
