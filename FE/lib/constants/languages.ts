export interface Language {
  id: string
  name: string
  nativeName: string
  description: string
  speakers: number
  maleCharacter: string
  femaleCharacter: string
  difficulty: 'beginner' | 'intermediate'
  color: string
}

export const LANGUAGES: Language[] = [
  {
    id: 'yoruba',
    name: 'Yoruba',
    nativeName: 'Yorùbá',
    description: 'A tonal language with deep literary, musical, and cultural traditions.',
    speakers: 45_000_000,
    maleCharacter: '/characters/yoruba-man.jpg',
    femaleCharacter: '/characters/yoruba-woman.jpg',
    difficulty: 'beginner',
    color: 'from-yellow-400 to-amber-500',
  },
  {
    id: 'igbo',
    name: 'Igbo',
    nativeName: 'Ìgbò',
    description: 'A language with a strong literary tradition, expressive tone patterns, and a global diaspora.',
    speakers: 27_000_000,
    maleCharacter: '/characters/igbo-man.jpg',
    femaleCharacter: '/characters/igbo-woman.jpg',
    difficulty: 'intermediate',
    color: 'from-green-400 to-emerald-500',
  },
  {
    id: 'hausa',
    name: 'Hausa',
    nativeName: 'Hausa',
    description: 'One of Africa\'s major languages of trade, storytelling, and everyday communication.',
    speakers: 72_000_000,
    maleCharacter: '/characters/hausa-man.jpg',
    femaleCharacter: '/characters/hausa-woman.jpg',
    difficulty: 'beginner',
    color: 'from-red-400 to-pink-500',
  },
  {
    id: 'pidgin',
    name: 'Nigerian Pidgin',
    nativeName: 'Naija Pidgin',
    description: 'A vibrant contact language with strong presence in music, humor, and everyday conversation.',
    speakers: 85_000_000,
    maleCharacter: '/characters/pidgin-character.jpg',
    femaleCharacter: '/characters/pidgin-character.jpg',
    difficulty: 'beginner',
    color: 'from-blue-400 to-cyan-500',
  },
]

export function getLanguageById(id: string): Language | undefined {
  return LANGUAGES.find((lang) => lang.id === id)
}
