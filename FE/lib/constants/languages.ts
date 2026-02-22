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
    description: 'The language of the Yoruba people. Spoken with rich tonal variations across West Africa.',
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
    description: 'The heart of the Igbo heritage. Known for its unique clickless consonant system.',
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
    description: 'The Hausa language connects millions across Nigeria and Niger. A language of commerce and tradition.',
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
    description: 'The vibrant language of street, music, and culture. Uniquely Nigerian and universally understood.',
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
