'use client'

import { Card } from '@/components/ui/card'
import React from 'react'

interface StatsCardProps {
  icon: React.ElementType
  label: string
  value: string | number
  description?: string
  trend?: {
    direction: 'up' | 'down'
    percentage: number
  }
  color?: 'primary' | 'accent' | 'success' | 'warning'
}

const colorMap = {
  primary: 'text-primary',
  accent: 'text-accent',
  success: 'text-green-500',
  warning: 'text-orange-500',
}

const bgColorMap = {
  primary: 'bg-primary/10',
  accent: 'bg-accent/10',
  success: 'bg-green-500/10',
  warning: 'bg-orange-500/10',
}

export function StatsCard({
  icon: Icon,
  label,
  value,
  description,
  trend,
  color = 'primary',
}: StatsCardProps) {
  return (
    <Card className="border border-border/50 p-6 hover:shadow-lg transition-all duration-300">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-foreground/60">{label}</p>
          <p className="mt-2 text-3xl font-bold text-foreground">{value}</p>
          {description && (
            <p className="mt-1 text-xs text-foreground/50">{description}</p>
          )}
          {trend && (
            <p
              className={`mt-2 text-xs font-semibold ${
                trend.direction === 'up' ? 'text-green-500' : 'text-red-500'
              }`}
            >
              {trend.direction === 'up' ? '↑' : '↓'} {trend.percentage}% from last week
            </p>
          )}
        </div>
        <div className={`flex-shrink-0 rounded-lg p-3 ${bgColorMap[color]}`}>
          <Icon className={`h-6 w-6 ${colorMap[color]}`} />
        </div>
      </div>
    </Card>
  )
}
