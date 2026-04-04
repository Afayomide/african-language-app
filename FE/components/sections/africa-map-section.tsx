import Image from 'next/image'
import { Card } from '@/components/ui/card'
import { AfricaLanguageSelector } from '@/components/sections/africa-language-selector'

export function AfricaMapSection({ startHref = '/auth/signup' }: { startHref?: string }) {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-background via-background to-primary/5 px-4 py-20">
      <div className="absolute inset-0 opacity-5">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(rgba(0,0,0,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,.1) 1px, transparent 1px)',
            backgroundSize: '50px 50px',
          }}
        />
      </div>

      <div className="relative mx-auto max-w-7xl">
        <div className="mb-16 text-center">
          <h2 className="mb-4 text-4xl font-black text-foreground text-balance md:text-5xl">
            Built for African Language Learning
          </h2>
          <p className="mx-auto max-w-3xl text-lg text-foreground/70">
            LinguaHub is being shaped as a continent-scale language platform. The current launch
            starts with Yoruba, Igbo, Hausa, and Pidgin, with room to grow across Africa over time.
          </p>
        </div>

        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
          <Card className="overflow-hidden border-2 border-primary/20 bg-white/70 shadow-2xl backdrop-blur-sm">
            <div className="relative aspect-[4/5] min-h-[420px] bg-gradient-to-br from-sky-50 via-white to-emerald-50">
              <Image
                src="/africa-map.png"
                alt="Map of Africa"
                fill
                priority
                className="object-contain p-8"
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
              <div className="absolute left-6 top-6 flex flex-wrap items-center gap-3">
                <div className="rounded-full border border-primary/20 bg-background/90 px-4 py-2 shadow-sm backdrop-blur">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/80">
                    Africa
                  </p>
                </div>
                <div className="rounded-full border border-border/30 bg-white/75 px-4 py-2 shadow-sm backdrop-blur">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-foreground/55">
                    Mosaic of Identities
                  </p>
                </div>
              </div>
              <div className="absolute bottom-6 left-6 right-6 rounded-3xl border border-border/40 bg-background/88 p-5 shadow-lg backdrop-blur">
                <p className="text-sm font-semibold text-foreground">Start from the map</p>
                <p className="mt-2 text-sm leading-relaxed text-foreground/70">
                  Explore the continent, pick a language, and start with practical greetings,
                  listening, and everyday conversation.
                </p>
              </div>
            </div>
          </Card>

          <AfricaLanguageSelector startHref={startHref} />
        </div>
      </div>
    </section>
  )
}
