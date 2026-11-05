'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Check, RotateCcw, X } from 'lucide-react'
import { KelaMascot } from '@lesson-player/components/mascot/KelaMascot'
import { cn } from '@/lib/utils'

// A three-question taste of a lesson, one per launch language. Keep these checked by a speaker.
const QUESTIONS = [
  {
    language: 'Yorùbá',
    lang: 'yo',
    phrase: 'Ẹ káàárọ̀',
    options: ['Good night', 'Good morning', 'Thank you', 'Welcome'],
    answer: 1,
    note: 'Ẹ káàárọ̀ is the respectful way to greet someone in the morning.',
  },
  {
    language: 'Igbo',
    lang: 'ig',
    phrase: 'Daalụ',
    options: ['Thank you', 'Goodbye', 'Hello', 'Sorry'],
    answer: 0,
    note: 'Daalụ is how you say thank you in Igbo.',
  },
  {
    language: 'Hausa',
    lang: 'ha',
    phrase: 'Sannu',
    options: ['Water', 'Please', 'Hello', 'Good night'],
    answer: 2,
    note: 'Sannu is an everyday Hausa greeting.',
  },
]

type Phase = 'choosing' | 'answered' | 'done'

function playSound(src: string) {
  try {
    const audio = new Audio(src)
    audio.volume = 0.35
    void audio.play().catch(() => {})
  } catch {
    // Sound is a nicety; ignore browsers that refuse it.
  }
}

export function TryItSection({ startHref = '/auth/signup' }: { startHref?: string }) {
  const [step, setStep] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const [phase, setPhase] = useState<Phase>('choosing')
  const [score, setScore] = useState(0)
  const continueRef = useRef<HTMLButtonElement>(null)

  const question = QUESTIONS[step]
  const isCorrect = selected === question?.answer
  const progress = phase === 'done' ? 100 : Math.round(((step + (phase === 'answered' ? 1 : 0)) / QUESTIONS.length) * 100)

  useEffect(() => {
    if (phase === 'answered') continueRef.current?.focus()
  }, [phase])

  const check = useCallback(() => {
    if (selected === null || !question) return
    const correct = selected === question.answer
    if (correct) setScore((value) => value + 1)
    playSound(correct ? '/sounds/correct.wav' : '/sounds/incorrect.wav')
    setPhase('answered')
  }, [question, selected])

  const next = useCallback(() => {
    if (step >= QUESTIONS.length - 1) {
      playSound('/sounds/lesson-complete.wav')
      setPhase('done')
      return
    }
    setStep((value) => value + 1)
    setSelected(null)
    setPhase('choosing')
  }, [step])

  const restart = () => {
    setStep(0)
    setSelected(null)
    setScore(0)
    setPhase('choosing')
  }

  return (
    <section id="try" className="relative scroll-mt-24 px-4 py-16 md:py-24">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 text-center">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-[#a94600]">Try it now</p>
          <h2 className="mt-2 font-display text-4xl font-black tracking-[-0.03em] text-[#191713] md:text-5xl">
            Your first three words
          </h2>
          <p className="mt-3 text-[#66655a]">No sign-up needed. This is what a Kela lesson feels like.</p>
        </div>

        <div className="overflow-hidden rounded-[2rem] border-2 border-[#efe4d8] bg-white shadow-[0_24px_60px_rgba(57,56,47,0.10)]">
          <div className="flex items-center gap-3 px-6 pt-6">
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-[#f1eee2]" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Mini lesson progress">
              <div
                className="kela-shimmer h-full rounded-full bg-[linear-gradient(90deg,#a94600,#ffae86)] transition-[width] duration-700"
                style={{ width: `${progress}%`, transitionTimingFunction: 'cubic-bezier(.3,1.3,.5,1)' }}
              />
            </div>
            <span className="text-xs font-black text-[#8a7d70]">
              {Math.min(step + 1, QUESTIONS.length)}/{QUESTIONS.length}
            </span>
          </div>

          {phase === 'done' ? (
            <div className="kela-pop flex flex-col items-center gap-4 px-6 pb-8 pt-6 text-center">
              <KelaMascot mood="celebrate" size={220} title="Kela celebrating" />
              <h3 className="font-display text-3xl font-black text-[#a94600]">
                {score === QUESTIONS.length ? 'Perfect score!' : `You got ${score} of ${QUESTIONS.length}!`}
              </h3>
              <p className="max-w-sm text-[#66655a]">
                You just met three languages. Keep going and Kela will guide you one small lesson at a time.
              </p>
              <div className="mt-2 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
                <Link
                  href={startHref}
                  className="kela-press inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-[#a94600] px-8 font-display text-lg font-extrabold uppercase tracking-[0.05em] text-white shadow-[0_5px_0_0_#6e2c00] hover:brightness-110 active:shadow-[0_2px_0_0_#6e2c00]"
                >
                  Keep learning
                  <ArrowRight className="h-5 w-5" />
                </Link>
                <button
                  type="button"
                  onClick={restart}
                  className="kela-press inline-flex h-14 items-center justify-center gap-2 rounded-2xl border-2 border-[#e6dccf] bg-white px-6 font-display text-base font-extrabold uppercase tracking-[0.05em] text-[#8b3900] shadow-[0_4px_0_0_#e6dccf] active:shadow-[0_1px_0_0_#e6dccf]"
                >
                  <RotateCcw className="h-4 w-4" />
                  Play again
                </button>
              </div>
            </div>
          ) : question ? (
            <div key={step} className="kela-enter px-6 pb-6 pt-5">
              <p className="text-sm font-bold text-[#8a7d70]">
                What does this <span className="text-[#a94600]">{question.language}</span> phrase mean?
              </p>
              <p lang={question.lang} className="mt-2 font-display text-4xl font-black tracking-[-0.02em] text-[#191713] md:text-5xl">
                {question.phrase}
              </p>

              <div className="mt-6 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Answer options">
                {question.options.map((option, optionIndex) => {
                  const isPicked = selected === optionIndex
                  const isAnswer = optionIndex === question.answer
                  const showRight = phase === 'answered' && isAnswer
                  const showWrong = phase === 'answered' && isPicked && !isAnswer
                  return (
                    <button
                      key={option}
                      type="button"
                      role="radio"
                      aria-checked={isPicked}
                      disabled={phase === 'answered'}
                      onClick={() => {
                        setSelected(optionIndex)
                        playSound('/sounds/click.wav')
                      }}
                      className={cn(
                        'kela-press flex w-full items-center gap-3 rounded-2xl border-2 px-4 py-4 text-left font-display text-lg font-bold transition-colors disabled:cursor-default',
                        showRight ? 'kela-pop border-[#57a764] bg-[#edf7ea] text-[#2d7c37] shadow-[0_4px_0_0_#9fd3a6]' : null,
                        showWrong ? 'kela-shake border-[#fa7150] bg-[#fff1ee] text-[#b23d21] shadow-[0_4px_0_0_#f6b5a6]' : null,
                        !showRight && !showWrong && isPicked ? 'border-[#a94600] bg-[#fff7ef] text-[#8a3800] shadow-[0_4px_0_0_#ffbe9b]' : null,
                        !showRight && !showWrong && !isPicked ? 'border-[#efe4d8] bg-white text-[#191713] shadow-[0_4px_0_0_#efe4d8] hover:bg-[#fffdf8]' : null,
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-black',
                          showRight ? 'bg-[#2d7c37] text-white' : showWrong ? 'bg-[#b23d21] text-white' : 'bg-[#f1eee2] text-[#7d7467]',
                        )}
                        aria-hidden="true"
                      >
                        {showRight ? <Check className="h-4 w-4 stroke-[3px]" /> : showWrong ? <X className="h-4 w-4 stroke-[3px]" /> : optionIndex + 1}
                      </span>
                      {option}
                    </button>
                  )
                })}
              </div>

              <div className="mt-6">
                {phase === 'answered' ? (
                  <div
                    className={cn(
                      'kela-slide-up flex items-center gap-4 rounded-[1.4rem] border-2 p-4',
                      isCorrect ? 'border-[#d7f0dc] bg-[#edf7ea]' : 'border-[#f6d4ce] bg-[#fff1ee]',
                    )}
                    role="status"
                  >
                    <div className="relative shrink-0">
                      <KelaMascot mood={isCorrect ? 'happy' : 'sad'} size={84} decorative />
                      <span
                        className={cn(
                          'absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white text-white',
                          isCorrect ? 'bg-[#2d7c37]' : 'bg-[#b23d21]',
                        )}
                        aria-hidden="true"
                      >
                        {isCorrect ? <Check className="h-3.5 w-3.5 stroke-[3.5px]" /> : <X className="h-3.5 w-3.5 stroke-[3.5px]" />}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={cn('font-display text-lg font-black', isCorrect ? 'text-[#2d7c37]' : 'text-[#b23d21]')}>
                        {isCorrect ? 'Nice one!' : 'Not quite'}
                      </p>
                      {!isCorrect ? (
                        <p className="text-sm text-[#39382f]">
                          <span className="font-bold text-[#b23d21]">Correct answer: </span>
                          <span className="font-bold">{question.options[question.answer]}</span>
                        </p>
                      ) : null}
                      <p className="text-sm text-[#66655a]">{question.note}</p>
                    </div>
                  </div>
                ) : null}

                {phase === 'answered' ? (
                  <button
                    ref={continueRef}
                    type="button"
                    onClick={next}
                    className={cn(
                      'kela-press mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-2xl font-display text-lg font-extrabold uppercase tracking-[0.05em] text-white',
                      isCorrect
                        ? 'bg-[#2d7c37] shadow-[0_5px_0_0_#1d5424] active:shadow-[0_2px_0_0_#1d5424]'
                        : 'bg-[#b23d21] shadow-[0_5px_0_0_#7a2815] active:shadow-[0_2px_0_0_#7a2815]',
                    )}
                  >
                    Continue
                    <ArrowRight className="h-5 w-5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={check}
                    disabled={selected === null}
                    className="kela-press flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#a94600] font-display text-lg font-extrabold uppercase tracking-[0.05em] text-white shadow-[0_5px_0_0_#6e2c00] active:shadow-[0_2px_0_0_#6e2c00] disabled:cursor-not-allowed disabled:bg-[#e6dccf] disabled:text-[#9b9186] disabled:shadow-[0_5px_0_0_#d5cabc]"
                  >
                    Check
                  </button>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}
