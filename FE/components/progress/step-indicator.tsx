'use client'

import { CheckCircle, Circle } from 'lucide-react'

interface Step {
  number: number
  label: string
  completed: boolean
  active: boolean
}

interface StepIndicatorProps {
  steps: Step[]
}

export function StepIndicator({ steps }: StepIndicatorProps) {
  return (
    <div className="flex items-center justify-between">
      {steps.map((step, index) => (
        <div key={step.number} className="flex items-center flex-1">
          {/* Step circle */}
          <div className="flex flex-col items-center">
            <div
              className={`relative flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all ${
                step.completed
                  ? 'border-green-500 bg-green-500'
                  : step.active
                    ? 'border-primary bg-primary'
                    : 'border-border bg-background'
              }`}
            >
              {step.completed ? (
                <CheckCircle className="h-6 w-6 text-white" />
              ) : (
                <span
                  className={`text-sm font-semibold ${
                    step.active || step.completed
                      ? 'text-white'
                      : 'text-foreground/60'
                  }`}
                >
                  {step.number}
                </span>
              )}
            </div>
            <p className="mt-2 text-xs font-medium text-foreground/70">
              {step.label}
            </p>
          </div>

          {/* Connector line */}
          {index < steps.length - 1 && (
            <div
              className={`mx-2 flex-1 h-1 rounded-full transition-all ${
                step.completed ? 'bg-green-500' : 'bg-border'
              }`}
            />
          )}
        </div>
      ))}
    </div>
  )
}
