'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import kelaArt from '../../assets/kela.png'

/**
 * Kela, the elephant from the logo, brought to life without redrawing it.
 *
 * The original artwork is used untouched. Motion comes from moving the whole picture
 * (breathing, tilting, hopping, drooping) and from eyelids laid exactly over the drawn eyes,
 * so Kela can blink, wink and squeeze its eyes shut in a smile. Small extras appear around
 * it: sparkles when happy, a sweat drop when sad, a thought bubble while thinking.
 *
 * Moods
 * - idle: breathes, sways a little, blinks. The default everywhere.
 * - happy: a squashy hop with smiling eyes and sparkles. Used for a correct answer.
 * - sad: sinks and tilts with heavy eyelids and a sweat drop. Used for a wrong answer or an error.
 * - celebrate: keeps jumping, winking and sparkling. Used when a lesson is finished.
 * - thinking: rocks side to side under a thought bubble. Used while something loads.
 * - wink: a single wink. Also plays on hover when `interactive` is set.
 *
 * With `interactive`, hovering winks and tapping makes Kela hop. All motion stops for people
 * who ask their system for reduced motion.
 */
export type KelaMood = 'idle' | 'happy' | 'sad' | 'celebrate' | 'thinking' | 'wink'

// Size of the logo artwork; every coordinate below is in its pixels.
const ART_W = 677
const ART_H = 369
const TRANSIENT_MS: Partial<Record<KelaMood, number>> = { wink: 1300, happy: 1000 }

// Measured from the artwork: centre and radii of each drawn eye.
const EYES = {
  l: { cx: 263, cy: 162, rx: 21, ry: 22 },
  r: { cx: 415, cy: 162, rx: 22, ry: 23 },
}
const LID_FILL = '#8E9293'
const LASH = '#2F2B2B'
const SPARKLE = 'M0 -14 C1.5 -4 4 -1.5 14 0 C4 1.5 1.5 4 0 14 C-1.5 4 -4 1.5 -14 0 C-4 -1.5 -1.5 -4 0 -14 Z'

function Lid({ side }: { side: 'l' | 'r' }) {
  const { cx, cy, rx, ry } = EYES[side]
  return (
    <g className={`k-lid k-lid-${side}`}>
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={LID_FILL} />
      {/* A relaxed closed eye for blinks and winks. */}
      <path className="k-lash-closed" d={`M${cx - rx + 2} ${cy + 4} Q${cx} ${cy + 16} ${cx + rx - 2} ${cy + 4}`} fill="none" stroke={LASH} strokeWidth={4.5} strokeLinecap="round" />
      {/* A squeezed, smiling eye ("^") for happy moments. */}
      <path className="k-lash-smile" d={`M${cx - rx + 3} ${cy + 8} Q${cx} ${cy - 10} ${cx + rx - 3} ${cy + 8}`} fill="none" stroke={LASH} strokeWidth={5} strokeLinecap="round" />
      {/* The heavy, half-closed lid edge for sad. */}
      <path className="k-lash-heavy" d={`M${cx - rx + 1} ${cy + 1} Q${cx} ${cy + 5} ${cx + rx - 1} ${cy + 1}`} fill="none" stroke={LASH} strokeWidth={4} strokeLinecap="round" />
    </g>
  )
}

export function KelaMascot({
  mood = 'idle',
  size = 96,
  interactive = false,
  animated = true,
  className,
  title = 'Kela the elephant',
  decorative = false,
}: {
  mood?: KelaMood
  /** Rendered width in pixels; height follows the artwork's proportions. */
  size?: number
  interactive?: boolean
  /** False draws a still Kela, for places where motion would distract. */
  animated?: boolean
  className?: string
  title?: string
  /** Hide from screen readers when the surrounding text already says what Kela shows. */
  decorative?: boolean
}) {
  const [transient, setTransient] = useState<KelaMood | null>(null)
  const [playCount, setPlayCount] = useState(0)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const play = useCallback((next: KelaMood) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setTransient(next)
    setPlayCount((count) => count + 1)
    timeoutRef.current = setTimeout(() => setTransient(null), TRANSIENT_MS[next] ?? 1000)
  }, [])

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
  }, [])

  const effective: KelaMood = transient ?? mood
  const height = Math.round((size * ART_H) / ART_W)

  const interactionProps = interactive
    ? {
        onPointerEnter: (event: React.PointerEvent) => {
          if (event.pointerType === 'mouse' && effective === 'idle') play('wink')
        },
        onClick: () => play('happy'),
        style: { cursor: 'pointer' } as const,
      }
    : {}

  return (
    <>
      <style href="kela-mascot-styles" precedence="default">
        {MASCOT_CSS}
      </style>
      <svg
        viewBox={`0 0 ${ART_W} ${ART_H}`}
        width={size}
        height={height}
        overflow="visible"
        className={['kela-m', animated ? `kela-m--${effective}` : 'kela-m--still', className].filter(Boolean).join(' ')}
        role={decorative ? undefined : 'img'}
        aria-hidden={decorative ? true : undefined}
        aria-label={decorative ? undefined : title}
        {...interactionProps}
      >
        <g key={`${effective}-${playCount}`} className="k-body">
          <g className="k-sway">
            <image href={kelaArt.src} width={ART_W} height={ART_H} />
            <Lid side="l" />
            <Lid side="r" />
          </g>

          <g className="k-fx k-sparkles" fill="#FFC53D" stroke="#E08A00" strokeWidth={2}>
            {/* Position lives on the wrapper because the animation owns the path's transform. */}
            <g transform="translate(560 70) scale(1.3)">
              <path className="k-spark k-spark-1" d={SPARKLE} />
            </g>
            <g transform="translate(118 64)">
              <path className="k-spark k-spark-2" d={SPARKLE} />
            </g>
            <g transform="translate(600 170) scale(0.8)">
              <path className="k-spark k-spark-3" d={SPARKLE} />
            </g>
          </g>

          <path
            className="k-fx k-sweat"
            d="M478 44 C488 60 494 70 494 78 C494 87 487 93 478 93 C469 93 462 87 462 78 C462 70 468 60 478 44 Z"
            fill="#9AD8FF"
            stroke="#3B8DC4"
            strokeWidth={3}
          />

          <g className="k-fx k-thought" fill="#FFFFFF" stroke="#C9BDB0" strokeWidth={3}>
            <circle className="k-dot k-dot-1" cx="536" cy="52" r="8" />
            <circle className="k-dot k-dot-2" cx="566" cy="30" r="11" />
            <circle className="k-dot k-dot-3" cx="604" cy="8" r="15" />
          </g>
        </g>
      </svg>
    </>
  )
}

const MASCOT_CSS = `
.kela-m { overflow: visible; }
.kela-m .k-body, .kela-m .k-sway, .kela-m .k-lid, .kela-m .k-spark, .kela-m .k-dot, .kela-m .k-sweat { transform-box: fill-box; }
.kela-m .k-body { transform-origin: 50% 100%; }
.kela-m .k-sway { transform-origin: 50% 90%; }
.kela-m .k-lid { transform-origin: 50% 0%; transform: scaleY(0); }
.kela-m .k-lash-smile, .kela-m .k-lash-heavy { opacity: 0; }
.kela-m .k-fx { opacity: 0; }
.kela-m .k-spark, .kela-m .k-dot { transform-origin: 50% 50%; }

/* idle: breathe, sway, blink */
.kela-m--idle .k-body { animation: k-breathe 3.4s ease-in-out infinite; }
.kela-m--idle .k-sway { animation: k-sway 6.5s ease-in-out infinite; }
.kela-m--idle .k-lid,
.kela-m--thinking .k-lid { animation: k-blink 4.6s ease-in-out infinite; }

/* wink */
.kela-m--wink .k-sway { animation: k-tilt 1.2s ease-in-out both; }
.kela-m--wink .k-lid-r { animation: k-close 1.2s ease-in-out both; }
.kela-m--wink .k-sparkles { opacity: 1; }
.kela-m--wink .k-spark-1 { animation: k-twinkle 1.2s ease-in-out both; }

/* happy */
.kela-m--happy .k-body { animation: k-hop 0.8s cubic-bezier(.3,1.5,.5,1) both; }
.kela-m--happy .k-lid { animation: k-close 1s ease-in-out both; }
.kela-m--happy .k-lash-closed { opacity: 0; }
.kela-m--happy .k-lash-smile { opacity: 1; }
.kela-m--happy .k-sparkles { opacity: 1; }
.kela-m--happy .k-spark { animation: k-twinkle 0.9s ease-out both; }
.kela-m--happy .k-spark-2 { animation-delay: 0.1s; }
.kela-m--happy .k-spark-3 { animation-delay: 0.2s; }

/* sad */
.kela-m--sad .k-body { animation: k-sink 0.6s ease-out both; }
.kela-m--sad .k-sway { animation: k-sad-tilt 0.6s ease-out both; }
.kela-m--sad .k-lid { animation: k-heavy 0.6s ease-out both; }
.kela-m--sad .k-lash-closed { opacity: 0; }
.kela-m--sad .k-lash-heavy { opacity: 1; }
.kela-m--sad .k-sweat { animation: k-sweat 1.6s ease-in 0.3s both; }

/* celebrate */
.kela-m--celebrate .k-body { animation: k-jump 1.1s cubic-bezier(.3,1.4,.5,1) infinite; }
.kela-m--celebrate .k-lid-r { animation: k-close-loop 2.2s ease-in-out infinite; }
.kela-m--celebrate .k-lid-l { animation: k-blink 3.3s ease-in-out infinite; }
.kela-m--celebrate .k-sparkles { opacity: 1; }
.kela-m--celebrate .k-spark { animation: k-twinkle-loop 1.1s ease-in-out infinite; }
.kela-m--celebrate .k-spark-2 { animation-delay: 0.35s; }
.kela-m--celebrate .k-spark-3 { animation-delay: 0.7s; }

/* thinking */
.kela-m--thinking .k-body { animation: k-breathe 2.6s ease-in-out infinite; }
.kela-m--thinking .k-sway { animation: k-rock 2.6s ease-in-out infinite; }
.kela-m--thinking .k-thought { opacity: 1; }
.kela-m--thinking .k-dot { animation: k-dot 1.5s ease-in-out infinite; }
.kela-m--thinking .k-dot-2 { animation-delay: 0.2s; }
.kela-m--thinking .k-dot-3 { animation-delay: 0.4s; }

@keyframes k-breathe { 0%,100% { transform: translateY(0) scale(1,1) } 50% { transform: translateY(-4px) scale(1.012,0.99) } }
@keyframes k-sway { 0%,100% { transform: rotate(0) } 30% { transform: rotate(-1.6deg) } 70% { transform: rotate(1.6deg) } }
@keyframes k-rock { 0%,100% { transform: rotate(-3deg) } 50% { transform: rotate(3deg) } }
@keyframes k-tilt { 0%,100% { transform: rotate(0) } 25%,70% { transform: rotate(-5deg) } }
@keyframes k-blink { 0%,91%,100% { transform: scaleY(0) } 94% { transform: scaleY(1) } 97% { transform: scaleY(0) } }
@keyframes k-close { 0%,100% { transform: scaleY(0) } 15%,70% { transform: scaleY(1) } }
@keyframes k-close-loop { 0%,55%,100% { transform: scaleY(0) } 65%,85% { transform: scaleY(1) } }
@keyframes k-heavy { to { transform: scaleY(0.5) } }
@keyframes k-hop {
  0% { transform: translateY(0) scale(1,1) }
  20% { transform: translateY(0) scale(1.07,0.9) }
  50% { transform: translateY(-30px) scale(0.95,1.06) }
  80% { transform: translateY(0) scale(1.05,0.95) }
  100% { transform: translateY(0) scale(1,1) }
}
@keyframes k-jump {
  0%,100% { transform: translateY(0) rotate(0) scale(1,1) }
  15% { transform: translateY(0) scale(1.08,0.9) }
  45% { transform: translateY(-34px) rotate(-4deg) scale(0.96,1.05) }
  70% { transform: translateY(0) rotate(3deg) scale(1.04,0.96) }
}
@keyframes k-sink { to { transform: translateY(8px) scale(0.97) } }
@keyframes k-sad-tilt { to { transform: rotate(-4deg) } }
@keyframes k-twinkle { 0% { transform: scale(0) rotate(0) } 50% { transform: scale(1.2) rotate(45deg) } 100% { transform: scale(0) rotate(90deg) } }
@keyframes k-twinkle-loop { 0%,100% { transform: scale(0.2) rotate(0); opacity: 0.4 } 50% { transform: scale(1.15) rotate(60deg); opacity: 1 } }
@keyframes k-sweat { 0% { opacity: 0; transform: translateY(-6px) } 20% { opacity: 1 } 80% { opacity: 1; transform: translateY(18px) } 100% { opacity: 0; transform: translateY(26px) } }
@keyframes k-dot { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-6px) } }

.kela-m--still .k-body, .kela-m--still .k-sway { animation: none; }

@media (prefers-reduced-motion: reduce) {
  .kela-m * { animation: none !important; }
}
`
