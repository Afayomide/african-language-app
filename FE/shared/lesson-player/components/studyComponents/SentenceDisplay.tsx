import { useMemo, useState, type ReactNode } from 'react'
import { Volume2 } from 'lucide-react'
import type { LearningContentComponent } from '../../types'
import { cx } from './StudyUi'

type AudioPlayerFn = (url?: string, speed?: number, onEnd?: () => void) => void

type SentenceRenderPart =
  | { type: 'text'; text: string }
  | { type: 'component'; text: string; component: LearningContentComponent }

type MeaningSegmentDisplay = {
  text: string
  sourceWords: string[]
  components: LearningContentComponent[]
}

function buildSentenceRenderParts(text: string, components: LearningContentComponent[]): SentenceRenderPart[] {
  const sentenceText = String(text || '')
  if (!sentenceText.trim() || components.length === 0) {
    return [{ type: 'text', text: sentenceText }]
  }

  const lowerSentence = sentenceText.toLocaleLowerCase()
  const parts: SentenceRenderPart[] = []
  let cursor = 0

  // A multi-word expression that carries its own word breakdown is rendered as separate
  // tappable words, so "Níbo ni" reads as [Níbo][ni] rather than one opaque chunk. An
  // expression with no breakdown (a genuine idiom) stays whole, which is the point of the
  // distinction. Ordering is preserved because the components are already in sentence order.
  const expandedComponents = components.flatMap((component) =>
    component.kind === 'expression' && component.components && component.components.length > 1
      ? component.components
      : [component],
  )

  for (const component of expandedComponents) {
    const componentText = String(component.text || '')
    if (!componentText) continue

    const matchIndex = lowerSentence.indexOf(componentText.toLocaleLowerCase(), cursor)
    if (matchIndex < 0) {
      return expandedComponents.flatMap((item, index) => {
        const rows: SentenceRenderPart[] = []
        if (index > 0) rows.push({ type: 'text', text: ' ' })
        rows.push({ type: 'component', text: item.text, component: item })
        return rows
      })
    }

    if (matchIndex > cursor) {
      parts.push({ type: 'text', text: sentenceText.slice(cursor, matchIndex) })
    }

    parts.push({
      type: 'component',
      text: sentenceText.slice(matchIndex, matchIndex + componentText.length),
      component,
    })
    cursor = matchIndex + componentText.length
  }

  if (cursor < sentenceText.length) {
    parts.push({ type: 'text', text: sentenceText.slice(cursor) })
  }

  return parts.filter((part) => part.type === 'component' || part.text.length > 0)
}

/** How many secondary meanings to show before collapsing into a "+N more" count. */
const MAX_OTHER_MEANINGS = 6

function SentenceGlossPanel({ component }: { component: LearningContentComponent }) {
  const translations = component.translations.filter(Boolean)
  // What this word means HERE -- empty unless the backend actually has a contextual gloss
  // for this occurrence. `ni` is "He is" in "Ọkùnrin ni." but "are the one" in "Ìwọ ni.",
  // and `sí` is "present" in "Bàbá ò sí ní ilé." rather than the directional "to".
  //
  // No fallback to translations[0] on purpose. This card is headed "in this sentence", so
  // whatever sits in it reads as the answer; a shared dictionary default is not that. `ń`
  // leads with "are" and would confidently mistranslate every non-plural subject. When
  // there is no gloss the panel drops to the plain list below, which states nothing.
  const inContext = component.selectedTranslation || ''
  // The dictionary entry. Shown in full (up to the cap) when nothing contextual is known,
  // otherwise trimmed to the alternatives not already shown above. Capped because a
  // grammatical particle can carry dozens of near-duplicate glosses -- `ni` has 54 -- and a
  // wall of chips buries the meaning the learner actually needs.
  const allOtherMeanings = inContext
    ? translations.filter((item) => item.trim().toLowerCase() !== inContext.trim().toLowerCase())
    : translations
  const otherMeanings = allOtherMeanings.slice(0, MAX_OTHER_MEANINGS)
  const hiddenMeaningCount = allOtherMeanings.length - otherMeanings.length

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#8a7d70]">{component.kind}</p>
        <p className="mt-1 text-lg font-black text-[#191713]">{component.text}</p>
        {component.pronunciation ? (
          <p className="mt-1 text-sm font-semibold italic text-[#8a7d70]">{component.pronunciation}</p>
        ) : null}
      </div>

      {inContext ? (
        <div className="space-y-1.5 rounded-2xl border border-[#efe4d8] bg-[#f7f3ea] p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#8a7d70]">In this sentence</p>
          <p className="text-base font-black text-[#191713]">{inContext}</p>
        </div>
      ) : null}

      {otherMeanings.length > 0 ? (
        <div className="space-y-1.5 rounded-2xl border border-[#efe4d8] bg-white/60 p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#8a7d70]">
            {inContext ? 'Also means' : 'Translations'}
          </p>
          <div className="flex flex-wrap gap-2">
            {otherMeanings.map((translation, index) => (
              <span
                key={`${component.id}-${translation}-${index}`}
                className="rounded-full bg-white px-2.5 py-1 text-sm font-bold text-[#5f5951]"
              >
                {translation}
              </span>
            ))}
            {hiddenMeaningCount > 0 ? (
              <span className="px-1 py-1 text-sm font-semibold text-[#8a7d70]">
                +{hiddenMeaningCount} more
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {component.explanation ? (
        <p className="text-sm font-medium leading-relaxed text-[#66655a]">{component.explanation}</p>
      ) : null}

      {/* A multi-word expression is only opaque when it is genuinely idiomatic. When the
          backend sends its word breakdown, show it so the learner can see that "Níbo ni"
          is "where" + "is" rather than a single unanalysable chunk. */}
      {component.components && component.components.length > 1 ? (
        <div className="space-y-1.5 rounded-2xl border border-[#efe4d8] bg-white/60 p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#8a7d70]">Breakdown</p>
          <div className="space-y-1">
            {component.components.map((part, index) => {
              // Unlike the card above, this keeps the dictionary fallback. These rows are the
              // words INSIDE an expression; the backend sends their meaning here (per sentence,
              // else per expression) when one is stored, and many are not yet -- dropping the
              // fallback would blank those rows. A row here is a decomposition aid rather than
              // a claim about this sentence, so the shared entry is honest enough.
              const partMeaning = part.selectedTranslation || part.translations.filter(Boolean)[0] || ''
              return (
                <div
                  key={`${component.id}-part-${part.id}-${index}`}
                  className="flex items-baseline justify-between gap-3"
                >
                  <span className="text-sm font-black text-[#191713]">{part.text}</span>
                  {partMeaning ? (
                    <span className="text-sm font-semibold text-[#66655a]">{partMeaning}</span>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function MeaningSegmentGlossPanel({ segment }: { segment: MeaningSegmentDisplay }) {
  const joinedSourceWords = segment.sourceWords.join(' ')

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#8a7d70]">Source</p>
        <p className="mt-1 text-lg font-black text-[#191713]">{joinedSourceWords || segment.text}</p>
      </div>

      {segment.components.length > 1 ? (
        <div className="space-y-1.5 rounded-2xl border border-[#efe4d8] bg-[#f7f3ea] p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#8a7d70]">Parts</p>
          <div className="flex flex-wrap gap-2">
            {segment.components.map((component, index) => (
              <span
                key={`${component.id}-${index}`}
                className="rounded-full bg-white px-2.5 py-1 text-sm font-bold text-[#5f5951]"
              >
                {component.text}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function InlineAudioButton({
  audioUrl,
  label,
  className,
  onPlayAudio,
}: {
  audioUrl?: string
  label: string
  className?: string
  onPlayAudio: AudioPlayerFn
}) {
  if (!audioUrl) return null

  return (
    <button
      type="button"
      className={cx(
        'inline-flex h-6 w-6 items-center justify-center rounded-full border border-[#eadfce] bg-white text-[#8b3900] transition-all hover:bg-[#fff7ef] active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20',
        className,
      )}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onPlayAudio(audioUrl)
      }}
      aria-label={`Play audio for ${label}`}
    >
      <Volume2 className="h-3.5 w-3.5" />
    </button>
  )
}

export function SentenceGlossToken({
  component,
  children,
  buttonClassName,
}: {
  component: LearningContentComponent
  children: ReactNode
  buttonClassName?: string
}) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <span className="relative inline-flex items-center gap-1 align-baseline" onMouseLeave={() => setIsOpen(false)}>
      <button
        type="button"
        className={cx(
          'inline rounded-none border-b border-[#d9c5b3] bg-transparent px-0.5 py-0 font-bold text-[#39382f] transition-colors hover:border-[#c8a88f] hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20',
          buttonClassName,
        )}
        onMouseEnter={() => setIsOpen(true)}
        onClick={() => setIsOpen((current) => !current)}
      >
        {children}
      </button>
      {isOpen ? (
        <div className="absolute left-1/2 top-full z-30 mt-3 w-72 -translate-x-1/2 rounded-3xl border border-[#efe4d8] bg-white p-4 shadow-xl">
          <SentenceGlossPanel component={component} />
        </div>
      ) : null}
    </span>
  )
}

function MeaningGlossToken({
  label,
  segment,
}: {
  label: string
  segment: MeaningSegmentDisplay
}) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <span className="relative inline-block align-baseline" onMouseLeave={() => setIsOpen(false)}>
      <button
        type="button"
        className="inline rounded-none border-b border-[#d9c5b3] bg-transparent px-0.5 py-0 font-bold text-[#39382f] transition-colors hover:border-[#c8a88f] hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
        onMouseEnter={() => setIsOpen(true)}
        onClick={() => setIsOpen((current) => !current)}
      >
        {label}
      </button>
      {isOpen ? (
        <div className="absolute left-1/2 top-full z-30 mt-3 w-72 -translate-x-1/2 rounded-3xl border border-[#efe4d8] bg-white p-4 shadow-xl">
          {segment.components.length === 1 ? (
            <SentenceGlossPanel component={segment.components[0]!} />
          ) : (
            <MeaningSegmentGlossPanel segment={segment} />
          )}
        </div>
      ) : null}
    </span>
  )
}

export function InlineGlossToken({
  label,
  component,
  onPlayAudio,
}: {
  label: string
  component: LearningContentComponent
  onPlayAudio: AudioPlayerFn
}) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <span className="relative inline-flex items-center gap-2 align-baseline" onMouseLeave={() => setIsOpen(false)}>
      <InlineAudioButton
        audioUrl={component.audio?.url}
        label={component.text}
        className="border-none bg-[#fff7ef] shadow-none"
        onPlayAudio={onPlayAudio}
      />
      <button
        type="button"
        className="inline rounded-none border-b border-[#d9c5b3] bg-transparent px-0.5 py-0 font-bold text-[#39382f] transition-colors hover:border-[#c8a88f] hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
        onMouseEnter={() => setIsOpen(true)}
        onClick={() => setIsOpen((current) => !current)}
      >
        {label}
      </button>
      {isOpen ? (
        <div className="absolute left-1/2 top-full z-30 mt-3 w-72 -translate-x-1/2 rounded-3xl border border-[#efe4d8] bg-white p-4 shadow-xl">
          <SentenceGlossPanel component={component} />
        </div>
      ) : null}
    </span>
  )
}

export function SentenceContentDisplay({
  text,
  components,
  audioUrl,
  disableGloss = false,
  onPlayAudio,
}: {
  text: string
  components: LearningContentComponent[]
  audioUrl?: string
  disableGloss?: boolean
  onPlayAudio: AudioPlayerFn
}) {
  const parts = useMemo(() => buildSentenceRenderParts(text, components), [text, components])

  return (
    <div className="space-y-6 text-center">
      <div className="flex items-start justify-center gap-3">
        <InlineAudioButton audioUrl={audioUrl} label={text} className="mt-2 shrink-0 self-start" onPlayAudio={onPlayAudio} />
        <div className="text-4xl font-black leading-[1.6] tracking-tight text-[#191713] sm:text-5xl">
          {parts.map((part, index) =>
            part.type === 'text' ? (
              <span key={`text-${index}`} className="whitespace-pre-wrap text-[#191713]">
                {part.text}
              </span>
            ) : (
              disableGloss ? (
                <span key={`component-${part.component.id}-${index}`} className="whitespace-pre-wrap text-[#191713]">
                  {part.text}
                </span>
              ) : (
                <SentenceGlossToken key={`component-${part.component.id}-${index}`} component={part.component}>
                  {part.text}
                </SentenceGlossToken>
              )
            ),
          )}
        </div>
      </div>
    </div>
  )
}

export function SentenceMeaningDisplay({
  text,
  audioUrl,
  meaningSegments,
  interactionWords,
  sourceComponents,
  onPlayAudio,
}: {
  text: string
  audioUrl?: string
  meaningSegments?: Array<{
    text: string
    sourceWordIndexes: number[]
    sourceComponentIndexes?: number[]
  }>
  interactionWords?: string[]
  sourceComponents?: LearningContentComponent[]
  onPlayAudio: AudioPlayerFn
}) {
  const segmentDisplays = useMemo(() => {
    if (!Array.isArray(meaningSegments) || meaningSegments.length === 0) return []

    return meaningSegments
      .map((segment) => {
        const sourceWords = Array.isArray(interactionWords)
          ? segment.sourceWordIndexes.map((index) => interactionWords[index] || '').filter(Boolean)
          : []
        const components = Array.isArray(sourceComponents)
          ? (segment.sourceComponentIndexes || [])
              .map((index) => sourceComponents[index])
              .filter((component): component is LearningContentComponent => Boolean(component))
          : []

        if (!segment.text.trim()) return null

        return {
          text: segment.text,
          sourceWords,
          components,
        }
      })
      .filter((segment): segment is MeaningSegmentDisplay => Boolean(segment))
  }, [interactionWords, meaningSegments, sourceComponents])

  return (
    <div className="space-y-6 text-center">
      <div className="flex items-start justify-center gap-3">
        <InlineAudioButton audioUrl={audioUrl} label={text} className="mt-2 shrink-0 self-start" onPlayAudio={onPlayAudio} />
        <div className="text-4xl font-black leading-[1.6] tracking-tight text-[#191713] sm:text-5xl">
          {segmentDisplays.length > 0 ? (
            segmentDisplays.map((segment, index) => (
              <span key={`${segment.text}-${index}`}>
                {index > 0 ? <span className="whitespace-pre-wrap text-[#191713]"> </span> : null}
                {segment.sourceWords.length > 0 || segment.components.length > 0 ? (
                  <MeaningGlossToken label={segment.text} segment={segment} />
                ) : (
                  <span className="whitespace-pre-wrap text-[#191713]">{segment.text}</span>
                )}
              </span>
            ))
          ) : (
            <span className="whitespace-pre-wrap text-[#191713]">{text}</span>
          )}
        </div>
      </div>
      {segmentDisplays.length > 0 ? (
        <p className="text-xs font-black uppercase tracking-[0.22em] text-foreground/45">
          Hover or tap the highlighted English parts to see the source wording
        </p>
      ) : null}
    </div>
  )
}
