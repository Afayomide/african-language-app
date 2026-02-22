'use client'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Lock, Play, CheckCircle } from 'lucide-react'
import Link from 'next/link'

interface LessonCardProps {
  id: string
  title: string
  description: string
  exerciseCount: number
  status: 'locked' | 'available' | 'completed'
  progress?: number
  language: string
}

export function LessonCard({
  id,
  title,
  description,
  exerciseCount,
  status,
  progress = 0,
  language,
}: LessonCardProps) {
  const isLocked = status === 'locked'
  const isCompleted = status === 'completed'

  return (
    <Card className={`overflow-hidden border transition-all duration-300 ${
      isLocked
        ? 'border-border/30 opacity-60'
        : 'border-border/50 hover:border-primary/50 hover:shadow-lg'
    }`}>
      <div className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-foreground">{title}</h3>
              {isCompleted && (
                <CheckCircle className="h-5 w-5 text-green-500" />
              )}
            </div>
            <p className="mt-1 text-sm text-foreground/60">{description}</p>
            <p className="mt-2 text-xs text-foreground/50">
              {exerciseCount} exercises
            </p>
          </div>

          {isLocked ? (
            <Lock className="h-5 w-5 text-foreground/40 flex-shrink-0" />
          ) : (
            <div className="flex-shrink-0">
              {isCompleted ? (
                <CheckCircle className="h-6 w-6 text-green-500" />
              ) : (
                <Play className="h-6 w-6 text-primary" />
              )}
            </div>
          )}
        </div>

        {!isLocked && progress > 0 && (
          <div className="mt-4 space-y-1">
            <div className="flex items-center justify-between text-xs text-foreground/60">
              <span>Progress</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {!isLocked && (
          <Link href={`/exercise?lesson=${id}&language=${language}`}>
            <Button
              size="sm"
              className="mt-4 w-full"
              disabled={isLocked}
            >
              {isCompleted ? 'Review' : 'Start Lesson'}
            </Button>
          </Link>
        )}
      </div>
    </Card>
  )
}
