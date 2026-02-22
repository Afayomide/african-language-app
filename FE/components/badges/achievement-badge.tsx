'use client'

import { Card } from '@/components/ui/card'
import React from 'react'

interface AchievementBadgeProps {
  icon: React.ElementType
  title: string
  description: string
  unlocked: boolean
  rarity?: 'common' | 'rare' | 'epic' | 'legendary'
}

const rarityColors = {
  common: 'bg-gray-100 text-gray-700 border-gray-300',
  rare: 'bg-blue-100 text-blue-700 border-blue-300',
  epic: 'bg-purple-100 text-purple-700 border-purple-300',
  legendary: 'bg-yellow-100 text-yellow-700 border-yellow-300',
}

export function AchievementBadge({
  icon: Icon,
  title,
  description,
  unlocked,
  rarity = 'common',
}: AchievementBadgeProps) {
  return (
    <Card
      className={`relative overflow-hidden border-2 p-6 text-center transition-all duration-300 ${
        unlocked
          ? rarityColors[rarity]
          : 'border-border/30 bg-gray-50 text-foreground/40'
      }`}
    >
      {/* Locked overlay */}
      {!unlocked && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/5 backdrop-blur-xs" />
      )}

      <div className={`flex justify-center ${unlocked ? '' : 'opacity-50'}`}>
        <Icon className="h-12 w-12" />
      </div>

      <h4 className="mt-3 font-bold">{title}</h4>
      <p className="mt-1 text-xs opacity-75">{description}</p>

      {!unlocked && (
        <p className="mt-3 text-xs font-semibold">Locked</p>
      )}
    </Card>
  )
}
