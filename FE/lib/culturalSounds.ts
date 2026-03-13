import type { Language } from '@/types'

export type CulturalSoundCue = 'celebration' | 'proverb'

const CUE_FILE_NAMES: Record<CulturalSoundCue, string> = {
  celebration: 'celebration.wav',
  proverb: 'proverb.wav',
}

const FALLBACK_SOUNDS: Record<CulturalSoundCue, string> = {
  celebration: '/sounds/lesson-complete.wav',
  proverb: '/sounds/click.wav',
}

const AVAILABLE_CULTURAL_SOUND_LANGUAGES = new Set<Language | string>(['yoruba'])

export function getCulturalSoundPath(language: Language | string | null | undefined, cue: CulturalSoundCue) {
  const normalizedLanguage = String(language || '').trim().toLowerCase()
  if (!normalizedLanguage || !AVAILABLE_CULTURAL_SOUND_LANGUAGES.has(normalizedLanguage)) {
    return FALLBACK_SOUNDS[cue]
  }
  return `/sounds/${normalizedLanguage}/${CUE_FILE_NAMES[cue]}`
}
