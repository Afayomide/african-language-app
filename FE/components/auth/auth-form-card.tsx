'use client'

import React from "react"

import { Card } from '@/components/ui/card'

interface AuthFormCardProps {
  children: React.ReactNode
}

export function AuthFormCard({ children }: AuthFormCardProps) {
  return (
    <Card className="border border-border/50 bg-white/50 backdrop-blur-sm p-8 shadow-xl">
      {children}
    </Card>
  )
}
