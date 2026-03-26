import type { ExerciseQuestion, QuestionMatchingDisplayItem } from '../../types'

export const SOUNDS = {
  correct: '/sounds/correct.wav',
  incorrect: '/sounds/incorrect.wav',
  click: '/sounds/click.wav',
  stageStart: '/sounds/stage-start.wav',
  stageComplete: '/sounds/stage-complete.wav',
  continue: '/sounds/continue.wav',
} as const

export const XP_PER_BLOCK = 10

export type StageTransitionCopy = {
  title: string
  subtitle: string
}

export function getListeningHeading(subtype?: ExerciseQuestion['subtype']) {
  switch (subtype) {
    case 'ls-mc-select-missing-word':
      return 'Listen and choose the missing word'
    case 'ls-mc-select-translation':
      return 'Listen and choose the correct meaning'
    case 'ls-fg-gap-fill':
      return 'Listen and fill in the blank'
    case 'ls-fg-word-order':
      return 'Listen and arrange the words'
    case 'ls-dictation':
      return 'Listen and type what you hear'
    case 'ls-tone-recognition':
      return 'Listen and identify the correct tone pattern'
    default:
      return 'Listen carefully and answer'
  }
}

export function getListeningSupportText(subtype?: ExerciseQuestion['subtype']) {
  switch (subtype) {
    case 'ls-mc-select-missing-word':
      return 'Play the audio and choose the word missing from the sentence.'
    case 'ls-mc-select-translation':
      return 'Play the audio and pick the correct English meaning.'
    case 'ls-fg-gap-fill':
      return 'Play the audio and choose the best word to complete the blank.'
    case 'ls-fg-word-order':
      return 'Play the audio and arrange the words in the correct order.'
    default:
      return 'Tap play and answer based on what you hear.'
  }
}

export function getChoiceSupportText(subtype?: ExerciseQuestion['subtype']) {
  switch (subtype) {
    case 'mc-select-context-response':
      return 'Choose the response that best fits the situation. Focus on respect, timing, and social context, not just literal meaning.'
    default:
      return ''
  }
}

export function getListeningPromptDetail(
  subtype: ExerciseQuestion['subtype'] | undefined,
  sentenceText: string,
  meaningText: string,
  renderedPrompt: string,
) {
  switch (subtype) {
    case 'ls-mc-select-missing-word':
    case 'ls-fg-gap-fill':
      return sentenceText
    case 'ls-fg-word-order':
      return meaningText ? `Meaning: ${meaningText}` : renderedPrompt
    default:
      return ''
  }
}

function shuffleItems<T>(items: T[]) {
  return items
    .map((item) => ({ item, sortKey: Math.random() }))
    .sort((left, right) => left.sortKey - right.sortKey)
    .map((entry) => entry.item)
}

export function buildMatchingFallbackItems(question: ExerciseQuestion | null) {
  const matchingPairs = Array.isArray(question?.interactionData?.matchingPairs)
    ? question!.interactionData!.matchingPairs!
    : []

  if (matchingPairs.length < 2) {
    return { leftItems: [] as QuestionMatchingDisplayItem[], rightItems: [] as QuestionMatchingDisplayItem[] }
  }

  const leftItems: QuestionMatchingDisplayItem[] = matchingPairs.map((pair) => ({
    id: pair.pairId,
    label: pair.contentText || pair.translation,
    translationIndex: pair.translationIndex,
  }))

  const rightItems: QuestionMatchingDisplayItem[] =
    question?.subtype === 'mt-match-image'
      ? matchingPairs
          .filter((pair) => pair.image?.url)
          .map((pair) => ({
            id: pair.pairId,
            label: pair.image?.altText || pair.translation,
            image: pair.image || null,
          }))
      : matchingPairs.map((pair) => ({
          id: pair.pairId,
          label: pair.translation,
        }))

  return { leftItems, rightItems: shuffleItems(rightItems) }
}

function hashString(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function createSeededRandom(seed: number) {
  let state = seed >>> 0 || 1
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

export function buildWordOrderDisplayOrder(words: string[], seedKey: string) {
  const indices = words.map((_, index) => index)
  if (indices.length <= 1) return indices
  if (indices.length === 2) return [1, 0]

  const original = indices.join(',')
  let best = [...indices]
  let bestFixedPositions = indices.length

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const random = createSeededRandom(hashString(`${seedKey}:${attempt}`))
    const candidate = [...indices]

    for (let index = candidate.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1))
      const current = candidate[index]
      candidate[index] = candidate[swapIndex]
      candidate[swapIndex] = current
    }

    const fixedPositions = candidate.reduce((count, value, index) => count + (value === index ? 1 : 0), 0)
    if (candidate.join(',') !== original && fixedPositions < bestFixedPositions) {
      best = candidate
      bestFixedPositions = fixedPositions
      if (fixedPositions === 0) break
    }
  }

  if (best.join(',') === original) {
    return [...indices].reverse()
  }

  return best
}

export function normalizeWordSequence(value: string) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function replacePromptToken(prompt: string, token: string, value: string) {
  return prompt.split(token).join(value)
}

export function buildStageTransitionCopy(input: {
  mistakesCount: number
  stageNumber: number
  totalStages: number
  isLastStage: boolean
  preview?: boolean
}): StageTransitionCopy {
  const title = input.isLastStage
    ? input.mistakesCount === 0
      ? 'Lesson locked in'
      : input.mistakesCount <= 2
        ? 'Strong finish'
        : 'Lesson complete'
    : input.mistakesCount === 0
      ? 'Clean round'
      : input.mistakesCount <= 2
        ? 'Nice work'
        : 'Good recovery'

  const subtitle = input.isLastStage
    ? input.preview
      ? 'Wrapping up preview...'
      : `Stage ${input.stageNumber} of ${input.totalStages} complete. Finishing lesson...`
    : `Stage ${input.stageNumber} of ${input.totalStages} complete. Next stage starts now.`

  return { title, subtitle }
}
