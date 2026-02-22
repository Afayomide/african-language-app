'use client'

import { InputHTMLAttributes } from 'react'
import { Eye, EyeOff } from 'lucide-react'

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  placeholder: string
  error?: string
  helperText?: string
  type?: string
  toggleIcon?: React.ElementType
  onToggle?: () => void
  hideLabel?: boolean
}

export function FormField({
  label,
  placeholder,
  error,
  helperText,
  type = 'text',
  toggleIcon: IconComponent,
  onToggle,
  hideLabel = false,
  ...props
}: FormFieldProps) {
  const isPassword = type === 'password' && !IconComponent
  const IconToShow = IconComponent || (isPassword ? Eye : null)

  return (
    <div className="space-y-2">
      {label && !hideLabel && (
        <label className="block text-sm font-medium text-foreground">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          type={type}
          placeholder={placeholder}
          className={`w-full rounded-lg border px-4 py-3 text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-2 transition-all ${
            IconToShow ? 'pr-10' : ''
          } ${
            error
              ? 'border-red-500 focus:ring-red-500'
              : 'border-border focus:ring-primary'
          }`}
          {...props}
        />
        {IconToShow && (
          <button
            type="button"
            onClick={onToggle}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/50 hover:text-foreground transition"
          >
            <IconToShow className="h-4 w-4" />
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      {helperText && !error && (
        <p className="text-xs text-foreground/50">{helperText}</p>
      )}
    </div>
  )
}
