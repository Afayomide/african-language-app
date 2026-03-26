import type { ButtonHTMLAttributes } from 'react'

export function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

export function Button({
  className,
  variant = 'default',
  size = 'default',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'ghost' | 'outline' | 'secondary'
  size?: 'default' | 'lg' | 'icon'
}) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap font-bold transition-all active:translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 disabled:pointer-events-none disabled:opacity-50',
        variant === 'default' && 'griot-cta active:shadow-none hover:brightness-[0.98]',
        variant === 'ghost' && 'griot-ghost-button hover:bg-white/95 active:shadow-none',
        variant === 'outline' && 'border border-[rgba(188,185,173,0.36)] bg-white/70 shadow-[0_10px_20px_rgba(57,56,47,0.05)] hover:bg-white/90 active:shadow-none',
        variant === 'secondary' && 'bg-[#f1eee2] text-[#5f5951] shadow-none hover:bg-[#ece8db] active:shadow-none',
        size === 'default' && 'h-10 rounded-xl px-4 py-2 text-sm',
        size === 'lg' && 'h-14 rounded-2xl px-8 py-3 text-base',
        size === 'icon' && 'h-10 w-10 rounded-full',
        className,
      )}
      {...props}
    />
  )
}
