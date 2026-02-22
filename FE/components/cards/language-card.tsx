'use client'

import { Card } from '@/components/ui/card'
import Image from 'next/image'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowRight } from 'lucide-react'

interface LanguageCardProps {
  id: string
  name: string
  nativeName: string
  description: string
  speakers: number
  maleCharacter: string
  femaleCharacter: string
  href: string
}

export function LanguageCard({
  id,
  name,
  nativeName,
  description,
  speakers,
  maleCharacter,
  femaleCharacter,
  href,
}: LanguageCardProps) {
  return (
    <Card className="group overflow-hidden border border-border/50 transition-all duration-300 hover:border-primary/50 hover:shadow-lg">
      {/* Character showcase */}
      <div className="relative h-48 overflow-hidden bg-gradient-to-br from-secondary/50 to-secondary/20">
        <div className="absolute inset-0 flex items-center justify-center gap-4">
          <div className="relative h-40 w-24 flex-shrink-0">
            <Image
              src={maleCharacter || "/placeholder.svg"}
              alt={`${name} character`}
              fill
              className="object-cover rounded-lg"
            />
          </div>
          <div className="relative h-40 w-24 flex-shrink-0">
            <Image
              src={femaleCharacter || "/placeholder.svg"}
              alt={`${name} character`}
              fill
              className="object-cover rounded-lg"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="space-y-4 p-6">
        <div>
          <h3 className="text-2xl font-bold text-foreground">{name}</h3>
          <p className="text-sm text-foreground/60">{nativeName}</p>
        </div>

        <p className="text-foreground/70 line-clamp-2">{description}</p>

        <div className="flex items-center justify-between pt-2">
          <div className="text-xs text-foreground/50">
            <p className="font-semibold text-foreground">
              {speakers.toLocaleString()}+
            </p>
            <p>speakers</p>
          </div>

          <Link href={href}>
            <Button
              size="sm"
              className="gap-2 group-hover:gap-3 transition-all"
            >
              Start
              <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </div>
      </div>
    </Card>
  )
}
