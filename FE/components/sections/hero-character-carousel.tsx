'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'

type Character = {
  src: string
  name: string
}

export function HeroCharacterCarousel({ characters }: { characters: Character[] }) {
  const [activeCharacter, setActiveCharacter] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveCharacter((prev) => (prev + 1) % characters.length)
    }, 4000)
    return () => clearInterval(interval)
  }, [characters.length])

  return (
    <div className="relative h-[500px] md:h-[600px] order-1 lg:order-2">
      <div className="relative w-full h-full flex items-center justify-center">
        {characters.map((character, index) => (
          <div
            key={character.name}
            className={`absolute inset-0 transition-all duration-1000 ease-out ${
              index === activeCharacter
                ? 'opacity-100 scale-100'
                : 'opacity-0 scale-95 pointer-events-none'
            }`}
          >
            <div className="relative w-full h-full flex items-center justify-center">
              <div className="absolute inset-12 rounded-full bg-gradient-to-br from-primary/10 to-accent/10 blur-3xl animate-pulse" />

              <div className="relative w-64 h-80 md:w-72 md:h-96 rounded-3xl overflow-hidden shadow-2xl border-8 border-white/50 backdrop-blur-sm">
                <Image
                  src={character.src || '/placeholder.svg'}
                  alt={character.name}
                  fill
                  className="object-cover"
                  sizes="300px"
                  priority={index === activeCharacter}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />

                <div className="absolute bottom-4 left-4 right-4 text-white text-center">
                  <p className="text-2xl font-black drop-shadow-lg">{character.name}</p>
                </div>
              </div>
            </div>
          </div>
        ))}

        <div className="absolute bottom-0 left-0 right-0 flex justify-center gap-3">
          {characters.map((character, index) => (
            <button
              key={character.name}
              onClick={() => setActiveCharacter(index)}
              className={`w-3 h-3 rounded-full transition-all duration-300 ${
                index === activeCharacter
                  ? 'bg-primary w-8'
                  : 'bg-border/50 hover:bg-primary/50'
              }`}
              aria-label={`Show ${character.name}`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
