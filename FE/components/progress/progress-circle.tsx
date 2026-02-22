'use client'

interface ProgressCircleProps {
  percentage: number
  size?: 'sm' | 'md' | 'lg'
  label?: string
  color?: 'primary' | 'accent' | 'success'
}

const sizeMap = {
  sm: { width: 80, radius: 36 },
  md: { width: 120, radius: 54 },
  lg: { width: 160, radius: 72 },
}

const colorMap = {
  primary: '#FF9D3D',
  accent: '#8B5CF6',
  success: '#10B981',
}

export function ProgressCircle({
  percentage,
  size = 'md',
  label,
  color = 'primary',
}: ProgressCircleProps) {
  const config = sizeMap[size]
  const circumference = 2 * Math.PI * config.radius
  const strokeDashoffset = circumference - (percentage / 100) * circumference

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative" style={{ width: config.width, height: config.width }}>
        {/* Background circle */}
        <svg
          width={config.width}
          height={config.width}
          className="absolute inset-0"
        >
          <circle
            cx={config.width / 2}
            cy={config.width / 2}
            r={config.radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            className="text-secondary"
          />
          {/* Progress circle */}
          <circle
            cx={config.width / 2}
            cy={config.width / 2}
            r={config.radius}
            fill="none"
            stroke={colorMap[color]}
            strokeWidth="4"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-500"
          />
        </svg>

        {/* Percentage text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-foreground">
            {percentage}%
          </span>
          {label && (
            <span className="text-xs text-foreground/60">{label}</span>
          )}
        </div>
      </div>
    </div>
  )
}
