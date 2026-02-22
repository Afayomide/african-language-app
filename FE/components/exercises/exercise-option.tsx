'use client'

import { Card } from '@/components/ui/card'
import React from 'react'
import Link from 'next/link'

interface ExerciseOptionProps {
  icon: React.ElementType
  title: string
  description: string
  href: string
  difficulty?: 'easy' | 'medium' | 'hard'
  estimatedTime?: number // in minutes
}

export function ExerciseOption({
  icon: Icon,
  title,
  description,
  href,
  difficulty = 'medium',
  estimatedTime = 5,
}: ExerciseOptionProps) {
  const difficultyColors = {
    easy: 'bg-green-500/10 text-green-700',
    medium: 'bg-orange-500/10 text-orange-700',
    hard: 'bg-red-500/10 text-red-700',
  }

  return (
    <Link href={href}>
      <Card className="group cursor-pointer overflow-hidden border border-border/50 transition-all duration-300 hover:border-primary/50 hover:shadow-lg hover:scale-105">
        <div className="p-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="mb-2 inline-flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-1">
                <Icon className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold text-primary">{title}</span>
              </div>
              <p className="mt-3 text-sm text-foreground/70">{description}</p>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${difficultyColors[difficulty]}`}>
                {difficulty}
              </span>
              <span className="text-xs text-foreground/50">
                ~{estimatedTime} min
              </span>
            </div>
            <div className="text-primary transition-transform group-hover:translate-x-1">
              →
            </div>
          </div>
        </div>
      </Card>
    </Link>
  )
}
