import { BookOpen, Flame, Languages, Target, type LucideIcon } from 'lucide-react'
import { KelaMascot } from '@lesson-player/components/mascot/KelaMascot'
import { Reveal } from '@/components/landing/reveal'
import { cn } from '@/lib/utils'

type Step = { title: string; description: string }

const ICONS: LucideIcon[] = [Languages, Target, BookOpen, Flame]
const NODE_COLORS = [
  { face: '#a94600', rim: '#6e2c00' },
  { face: '#e8890c', rim: '#a35e00' },
  { face: '#2d7c37', rim: '#1d5424' },
  { face: '#c8693f', rim: '#8a4022' },
]
// Nodes wander left and right like a trail, the way a lesson path does.
const OFFSETS = ['md:translate-x-0', 'md:translate-x-24', 'md:-translate-x-10', 'md:translate-x-16']

/** "How it works" drawn as a learning path: each step is a node that pops in as it scrolls into view. */
export function LearningPathSection({ title, steps }: { title: string; steps: Step[] }) {
  return (
    <section id="how-it-works" className="relative scroll-mt-24 overflow-hidden px-4 py-20">
      <div className="mx-auto max-w-4xl">
        <Reveal className="mb-14 text-center">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-[#a94600]">Your path</p>
          <h2 className="mt-2 font-display text-4xl font-black tracking-[-0.03em] text-[#191713] md:text-5xl">{title}</h2>
        </Reveal>

        <div className="relative">
          {/* The trail behind the nodes. */}
          <div className="absolute bottom-10 left-10 top-10 w-1 rounded-full bg-[repeating-linear-gradient(to_bottom,#efe4d8_0_14px,transparent_14px_26px)] md:left-1/2 md:-translate-x-1/2" aria-hidden="true" />

          <ol className="relative space-y-12">
            {steps.map((step, index) => {
              const Icon = ICONS[index % ICONS.length]
              const color = NODE_COLORS[index % NODE_COLORS.length]
              return (
                <li key={step.title}>
                  <Reveal delay={index * 80} className={cn('flex items-center gap-6 md:justify-center', OFFSETS[index % OFFSETS.length])}>
                    <div
                      className="relative flex h-20 w-20 shrink-0 items-center justify-center rounded-full text-white transition-transform duration-200 hover:-translate-y-1"
                      style={{ background: color.face, boxShadow: `0 7px 0 0 ${color.rim}` }}
                    >
                      <Icon className="h-9 w-9" aria-hidden="true" />
                      <span className="absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-[#191713] text-xs font-black">
                        {index + 1}
                      </span>
                    </div>
                    <div className="max-w-xs rounded-2xl border-2 border-[#efe4d8] bg-white p-4 shadow-[0_4px_0_0_#efe4d8]">
                      <h3 className="font-display text-lg font-black text-[#191713]">{step.title}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-[#66655a]">{step.description}</p>
                    </div>
                    {index === 0 ? (
                      <div className="hidden lg:block">
                        <KelaMascot mood="idle" size={150} interactive decorative />
                      </div>
                    ) : null}
                  </Reveal>
                </li>
              )
            })}
          </ol>
        </div>
      </div>
    </section>
  )
}
