import { Info, Quote, Turtle, Volume2 } from 'lucide-react'
import type { Language, LearningContent, Proverb } from '../../types'
import { Button, cx } from './StudyUi'
import { SentenceContentDisplay } from './SentenceDisplay'

type AudioPlayerFn = (url?: string, speed?: number, onEnd?: () => void) => void

const WORD_FOCUS_CONTEXT_IMAGE_BY_LANGUAGE: Record<Language, string> = {
  yoruba:
    'https://lh3.googleusercontent.com/aida-public/AB6AXuBqF08U8tBReYC-NbmzpMUdz5Z9vS9fKFr1nVBSGqyWALHyUybj5bLqOqLSjfAI2vWfzkDav83PycWP_DHtHa77U97Wx0G7-xHTmO6ybebxGNW2-mvGTZ-Go5Djoe9gft6kNOePsNxLElQ_Nl6R8dR9gKy6Al3Q7cXtg96021DwaGiz7YKl8BXzoG8D2XLtst5KVl4mfdFNkC4rtj5I5OWjrxaNKCplpExyZICzkxVQrEkCV9IhDgTjcaH77MfGis0-W5dWm3Mb9deK',
  igbo:
    'https://lh3.googleusercontent.com/aida-public/AB6AXuDYry1i8BrwmeEaCpCMy3Bw1vjOshZ_cpas35XLOVnyC_dN8BVbnocw1sHiTEQ5FK6QwxXTy3NhXQ5jKitgL-MMBGWHym52IZlU_8tkJkRZifvTrAbG5cUooRUbchmbObEa8DmR6vV9IkOBu8gO6HWRbzY3RfBYp987QbEuYE37omJh4JaNW10Cyv4Qm4cAoosEJAm94aa9TCKKksmGVlVFZjP2IH95upXmZ8MFan4hRFKRIwhZ2teLjf9cVETvtVV41fYvuZbpJKbO',
  hausa:
    'https://lh3.googleusercontent.com/aida-public/AB6AXuChHsMGj_MWqxZDMDUlyYwVvVcrjDU8deEgWcVtkFJoD-tvNp2dyxs94WERV7pwX_Xzdq62PkBrGD4afYfXJTdfZAbSF9gqcECVjLD23Gp5drdCF-ZcPimXPHdRQuDjlBWRzjIR_JOxQSVC5q-XIbc9dCMPFB9UMuIL_TR8HTQwsqqcVTNwrVVfH4PQsROCSnZDQRTY9nUk-gPBAyasFZdIsnvKZLbABsZUGrVYWQb9P1ypIxJYpcY0yWP-qp_m9f4HKxerXKLzL-OK',
}

function capitalizeLabel(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value
}

function splitTranslationNote(input: string) {
  const text = String(input ?? '')
  if (!text) return { main: '', note: '' }

  const match = text.match(/^(.*?)(\s*\(([^)]+)\))$/)
  if (!match) {
    return { main: text, note: '' }
  }

  return {
    main: match[1] ?? text,
    note: match[3] ?? '',
  }
}

function buildDesktopWordFocusChips({
  content,
  language,
  translationNote,
}: {
  content: LearningContent
  language?: Language
  translationNote: string
}) {
  const chips: Array<{ label: string; accent?: boolean }> = []

  chips.push({ label: capitalizeLabel(content.kind || 'expression') })
  chips.push({ label: content.pronunciation ? 'Tone Practice' : 'Core Meaning' })
  chips.push({ label: translationNote ? capitalizeLabel(translationNote) : capitalizeLabel(language || 'Study') })
  chips.push({ label: 'Core Vocab', accent: true })

  return chips
}

function buildContextTitle(language?: Language) {
  if (language === 'yoruba') return 'Morning in Yorubaland'
  if (language === 'igbo') return 'Everyday Igbo Life'
  if (language === 'hausa') return 'Everyday Hausa Speech'
  return 'Living Language Context'
}

function buildContextSubtitle(language?: Language, explanation?: string) {
  if (explanation) return explanation
  if (language === 'yoruba') return 'Used in daily greetings after sunrise and in relaxed first encounters.'
  if (language === 'igbo') return 'Used in everyday speech with a clear, confident rhythm.'
  if (language === 'hausa') return 'Used in common social exchanges and practical daily speech.'
  return 'Listen closely, repeat it aloud, and attach the meaning to a living context.'
}

function buildLanguageChipLabel(language?: Language) {
  if (language === 'yoruba') return 'Dialect: Central Yoruba'
  if (language === 'igbo') return 'Register: Standard Igbo'
  if (language === 'hausa') return 'Register: Common Hausa'
  return `Language: ${capitalizeLabel(language || 'Yoruba')}`
}

export function TeacherNoteBlock({
  content,
  isShortViewport,
  isUltraShortViewport,
}: {
  content: string
  isShortViewport: boolean
  isUltraShortViewport: boolean
}) {
  return (
    <section className={cx('animate-in fade-in zoom-in-95 duration-500', isUltraShortViewport ? 'space-y-3 py-2' : isShortViewport ? 'space-y-4 py-3' : 'space-y-6 py-4')}>
      <div className={cx('rounded-[2.5rem] griot-paper', isUltraShortViewport ? 'p-4' : isShortViewport ? 'p-6' : 'p-8')}>
        <div className={cx('mb-6 flex items-center gap-4', isUltraShortViewport && 'mb-4')}>
          <div className={cx('flex items-center justify-center rounded-2xl griot-cta', isUltraShortViewport ? 'h-10 w-10' : 'h-12 w-12')}>
            <Info className={cx(isUltraShortViewport ? 'h-5 w-5' : 'h-6 w-6')} />
          </div>
          <div>
            <h2 className={cx('font-display font-black text-foreground', isUltraShortViewport ? 'text-lg' : isShortViewport ? 'text-xl' : 'text-2xl')}>
              Teacher&apos;s Note
            </h2>
            {!isUltraShortViewport ? <p className="griot-label">Context & Usage</p> : null}
          </div>
        </div>
        <div className={cx('prose prose-stone max-w-none font-medium leading-relaxed text-foreground/80', isUltraShortViewport ? 'text-sm' : 'text-base')}>
          {content}
        </div>
      </div>
    </section>
  )
}

export function ContentStudyBlock({
  content,
  language,
  isShortViewport,
  isUltraShortViewport,
  isDesktopViewport,
  onPlayAudio,
  onPlayClick,
}: {
  content: LearningContent
  language?: Language
  isShortViewport: boolean
  isUltraShortViewport: boolean
  isDesktopViewport: boolean
  onPlayAudio: AudioPlayerFn
  onPlayClick: () => void
}) {
  const translation = content.selectedTranslation || content.translations?.[0] || ''
  const translationParts = splitTranslationNote(translation)
  const desktopChips = buildDesktopWordFocusChips({ content, language, translationNote: translationParts.note })
  const contextImage = WORD_FOCUS_CONTEXT_IMAGE_BY_LANGUAGE[language || 'yoruba']
  const contextCopy = buildContextSubtitle(language, content.explanation)
  const isDesktopLayout = isDesktopViewport
  const headlineLength = content.text.trim().length
  const desktopHeadlineClass =
    headlineLength > 18
      ? 'text-[3.1rem] leading-[1.02] sm:text-[3.7rem]'
      : headlineLength > 10
        ? 'text-[3.9rem] leading-[0.98] sm:text-[4.4rem]'
        : 'text-[4.5rem] leading-[0.95] sm:text-[5rem]'
  const mobileHeadlineClass =
    headlineLength > 18
      ? 'text-[2.3rem] leading-[1.04]'
      : headlineLength > 10
        ? 'text-[2.7rem] leading-[1.02]'
        : isUltraShortViewport
          ? 'text-[3rem] leading-none'
          : isShortViewport
            ? 'text-[3.35rem] leading-none'
            : 'text-[3.6rem] leading-none'

  return (
    <section
      className={cx(
        'animate-in fade-in slide-in-from-bottom-6 duration-500',
        isDesktopLayout ? 'flex min-h-full flex-col justify-center py-8' : isUltraShortViewport ? 'space-y-4 py-2' : isShortViewport ? 'space-y-5 py-3' : 'space-y-8 py-4',
      )}
    >
      <div className={cx('mx-auto w-full', isDesktopLayout ? 'max-w-[64rem]' : 'max-w-[26rem]')}>
        <div className={cx(isDesktopLayout ? 'grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(315px,0.78fr)]' : 'space-y-8')}>
          <div className={cx(isDesktopLayout ? 'space-y-7 lg:pr-2' : 'space-y-6')}>
            <div className={cx(isDesktopLayout ? 'text-left' : 'text-center')}>
              {isDesktopLayout ? (
                content.kind === 'sentence' && Array.isArray(content.components) && content.components.length > 0 ? (
                  <div className="max-w-2xl pt-1">
                    <SentenceContentDisplay
                      text={content.text}
                      components={content.components}
                      audioUrl={undefined}
                      onPlayAudio={onPlayAudio}
                    />
                  </div>
                ) : (
                  <h1 className={cx('font-display font-black tracking-[-0.06em] text-[#191713]', desktopHeadlineClass)}>
                    {content.text}
                  </h1>
                )
              ) : null}
            </div>

            {!isDesktopLayout ? (
              <div className="relative group">
                <div className="absolute inset-0 rounded-[2.55rem] bg-[rgba(169,70,0,0.05)] shadow-[0_12px_40px_rgba(169,70,0,0.06)] transition-transform duration-500 group-hover:rotate-0 -rotate-2 scale-[1.03]" />
                <div
                  className={cx(
                    'relative rounded-[3rem] griot-paper text-center',
                    isUltraShortViewport ? 'space-y-6 p-6' : isShortViewport ? 'space-y-8 p-8' : 'space-y-10 p-12',
                  )}
                >
                  <div className="flex justify-center gap-4">
                    <Button
                      size="lg"
                      className={cx(
                        'rounded-[1.35rem] p-0 transition-transform hover:scale-105 active:scale-95',
                        isUltraShortViewport ? 'h-16 w-16' : 'h-20 w-20',
                      )}
                      onClick={() => {
                        onPlayClick()
                        onPlayAudio(content.audio?.url)
                      }}
                    >
                      <Volume2 className={cx(isUltraShortViewport ? 'h-8 w-8' : 'h-10 w-10')} />
                    </Button>
                    <Button
                      size="lg"
                      variant="secondary"
                      className={cx(
                        'rounded-[1.35rem] border-0 p-0 hover:brightness-95 active:scale-95 transition-transform',
                        isUltraShortViewport ? 'h-16 w-16' : 'h-20 w-20',
                      )}
                      onClick={() => {
                        onPlayClick()
                        onPlayAudio(content.audio?.url, 0.6)
                      }}
                    >
                      <Turtle className={cx(isUltraShortViewport ? 'h-8 w-8' : 'h-10 w-10')} />
                    </Button>
                  </div>

                  <div className="space-y-6 text-center">
                    {content.kind === 'sentence' && Array.isArray(content.components) && content.components.length > 0 ? (
                      <SentenceContentDisplay
                        text={content.text}
                        components={content.components}
                        audioUrl={undefined}
                        onPlayAudio={onPlayAudio}
                      />
                    ) : (
                      <h3 className={cx('font-display font-black tracking-[-0.05em] text-foreground', mobileHeadlineClass)}>
                        {content.text}
                      </h3>
                    )}

                    <div className="flex justify-center gap-3">
                      <span className="h-2 w-2 rounded-full bg-primary/20" />
                      <span className="h-2 w-2 rounded-full bg-primary/40" />
                      <span className="h-2 w-2 rounded-full bg-primary/20" />
                    </div>
                  </div>

                  <div className="mx-auto w-full max-w-[20rem] rounded-[1.5rem] bg-secondary/30 px-6 py-5 shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)]">
                    <p className={cx('font-body font-bold leading-snug text-secondary-foreground', isUltraShortViewport ? 'text-[1.25rem]' : 'text-[1.65rem]')}>
                      {translationParts.main}
                      {translationParts.note ? <span className="ml-1 text-[#b95b19]">({translationParts.note})</span> : null}
                    </p>
                  </div>

                  <div className="inline-flex items-center gap-2 rounded-full bg-[#e6f3df] px-3.5 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#3f6b37]">
                    <span className="inline-block h-2 w-2 rounded-full bg-[#5b8e52]" />
                    {buildLanguageChipLabel(language)}
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-4 pt-1">
                  <Button
                    size="icon"
                    className="h-16 w-16 rounded-full bg-[linear-gradient(180deg,#c25910,#a94600)] text-white shadow-[0_16px_28px_rgba(169,70,0,0.22)] hover:scale-105"
                    onClick={() => {
                      onPlayClick()
                      onPlayAudio(content.audio?.url)
                    }}
                  >
                    <Volume2 className="h-7 w-7" />
                  </Button>
                  <Button
                    size="icon"
                    variant="secondary"
                    className="h-14 w-14 rounded-full bg-[#f1eee2] text-[#8b3900] hover:bg-[#ece8db]"
                    onClick={() => {
                      onPlayClick()
                      onPlayAudio(content.audio?.url, 0.6)
                    }}
                  >
                    <Turtle className="h-6 w-6" />
                  </Button>
                </div>

                <div className="max-w-[32rem] rounded-[1.7rem] border-l-[3px] border-[#a94600] bg-[#fdf9f1] px-7 py-6 shadow-[0_10px_26px_rgba(57,56,47,0.04)]">
                  <p className="mb-2 text-[11px] font-black uppercase tracking-[0.24em] text-[#8a7d70]">Translation</p>
                  <p className="font-display text-[2.05rem] font-bold leading-tight text-[#191713]">
                    {translationParts.main}
                    {translationParts.note ? <span className="ml-2 font-medium text-[#b95b19]">({translationParts.note})</span> : null}
                  </p>
                </div>
              </>
            )}
          </div>

          {isDesktopLayout ? (
            <div className="relative">
              <div className="aspect-[0.82] overflow-hidden rounded-[2rem] border-[8px] border-white bg-[#f7f3ea] shadow-[0_18px_38px_rgba(57,56,47,0.18)] transition-transform duration-500 rotate-[2.5deg] hover:rotate-0">
                <img
                  src={contextImage}
                  alt={buildContextTitle(language)}
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent p-6 text-white">
                  <p className="text-lg font-bold leading-tight">{buildContextTitle(language)}</p>
                  <p className="mt-1 text-sm italic text-white/85">{contextCopy}</p>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {isDesktopLayout ? (
          <div className="mt-12 flex flex-wrap justify-center gap-3.5">
            {desktopChips.map((chip) => (
              <div
                key={chip.label}
                className={cx(
                  'rounded-[1.15rem] px-6 py-3.5 text-[1rem] font-bold transition-all',
                  chip.accent
                    ? 'flex items-center gap-2 bg-[#ffdeac] text-[#6e4b00] shadow-[0_10px_22px_rgba(134,93,0,0.12)]'
                    : 'bg-[#ece8db] text-[#39382f] shadow-[0_2px_0_rgba(255,255,255,0.75)]',
                )}
              >
                {chip.accent ? <span className="text-base">★</span> : null}
                {chip.label}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  )
}

export function ProverbStudyBlock({
  proverb,
  isShortViewport,
  isUltraShortViewport,
}: {
  proverb: Proverb
  isShortViewport: boolean
  isUltraShortViewport: boolean
}) {
  return (
    <section
      className={cx(
        'animate-in fade-in slide-in-from-bottom-6 duration-500',
        isUltraShortViewport ? 'space-y-4 py-2' : isShortViewport ? 'space-y-5 py-3' : 'space-y-8 py-4',
      )}
    >
      <div className="text-center">
        <p className={cx('font-black uppercase tracking-[0.3em] text-amber-700/60', isUltraShortViewport ? 'text-[9px]' : isShortViewport ? 'text-[10px]' : 'text-xs')}>
          Cultural Wisdom
        </p>
      </div>

      <div
        className={cx(
          'relative overflow-hidden rounded-[2rem] border border-[#f0e2cf] bg-[#fdf9f1] shadow-[0_18px_34px_rgba(57,56,47,0.06)]',
          isUltraShortViewport ? 'p-3.5 sm:p-4' : isShortViewport ? 'p-4 sm:p-5' : 'p-6 sm:p-10',
        )}
      >
        <Quote className="absolute -left-1 -top-1 h-14 w-14 -rotate-12 text-[#ffdeac]" />
        <div className="relative space-y-5">
          <h3 className={cx('font-display font-black leading-snug text-[#5b2b03]', isUltraShortViewport ? 'text-lg sm:text-xl' : isShortViewport ? 'text-xl sm:text-2xl' : 'text-2xl sm:text-3xl')}>
            {proverb.text}
          </h3>
          <div className="h-px w-20 bg-[#ffcc79]" />
          <p className={cx('font-semibold italic text-[#7a5b3e]', isUltraShortViewport ? 'text-sm' : isShortViewport ? 'text-base' : 'text-lg')}>
            {proverb.translation || ''}
          </p>
        </div>
      </div>

      {proverb.contextNote ? (
        <div className="flex gap-3 rounded-[1.5rem] border border-[#ebe4db] bg-white p-5">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-[#865d00]" />
          <p className="text-sm font-medium leading-relaxed text-[#66655a]">{proverb.contextNote}</p>
        </div>
      ) : null}
    </section>
  )
}
