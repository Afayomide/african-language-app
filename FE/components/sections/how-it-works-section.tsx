'use client'

interface Step {
  step: string
  title: string
  description: string
}

interface HowItWorksSectionProps {
  title: string
  steps: Step[]
}

export function HowItWorksSection({ title, steps }: HowItWorksSectionProps) {
  return (
    <section id="how-it-works" className="relative px-4 py-20">
      <div className="mx-auto max-w-4xl">
        <h2 className="mb-16 text-center text-4xl font-bold text-foreground">
          {title}
        </h2>

        <div className="space-y-8">
          {steps.map((item) => (
            <div key={item.step} className="flex gap-6">
              <div className="flex flex-shrink-0 items-center justify-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  {item.step}
                </div>
              </div>
              <div className="flex flex-col justify-center">
                <h3 className="text-xl font-bold text-foreground">
                  {item.title}
                </h3>
                <p className="mt-2 text-foreground/70">{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
