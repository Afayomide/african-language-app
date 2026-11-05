import type { ReactNode } from 'react'
import { MotionStyles } from '@lesson-player/motion'

// Re-mounts on every learner navigation, so each page fades in. Opacity only: a transform
// here would re-anchor the position:fixed footers and headers inside the pages.
export default function LearnerTemplate({ children }: { children: ReactNode }) {
  return (
    <>
      <MotionStyles />
      <div className="kela-fade">{children}</div>
    </>
  )
}
