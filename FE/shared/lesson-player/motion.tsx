/**
 * Shared motion for the learner app and the lesson player.
 *
 * Rendered as a React 19 hoisted <style> so it reaches both apps that render the player
 * (FE and tutorFE) without either app's global stylesheet. React dedupes it by `href`, so
 * mounting it in several places costs nothing.
 *
 * Classes
 * - kela-enter: a block or card arriving (rise, fade, slight overshoot).
 * - kela-fade: opacity only. Safe on wrappers that hold position:fixed children, because a
 *   transform on an ancestor would re-anchor them.
 * - kela-pop: a correct answer or a reward appearing.
 * - kela-shake: a wrong answer.
 * - kela-slide-up: the feedback panel rising from the bottom.
 * - kela-bump: a number that just changed.
 * - kela-stagger: children enter one after another; set --i on each child.
 * - kela-float: a slow hover, for decorative pieces.
 * - kela-shimmer: a light sweep across a progress fill.
 * - kela-reveal-wait: hidden until scrolled into view (then swapped for kela-enter).
 * Animations hold their first frame while delayed and release the element when done, so
 * hover and press styles keep working afterwards.
 * Everything is switched off for people who ask for reduced motion.
 */
export function MotionStyles() {
  return (
    <style href="kela-motion-styles" precedence="default">
      {MOTION_CSS}
    </style>
  )
}

const MOTION_CSS = `
@keyframes kela-enter {
  from { opacity: 0; transform: translateY(18px) scale(0.98); }
  60% { opacity: 1; transform: translateY(-3px) scale(1.005); }
  to { opacity: 1; transform: none; }
}
@keyframes kela-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes kela-pop {
  0% { transform: scale(0.85); }
  45% { transform: scale(1.06); }
  70% { transform: scale(0.98); }
  100% { transform: scale(1); }
}
@keyframes kela-shake {
  0%, 100% { transform: translateX(0); }
  15% { transform: translateX(-9px); }
  30% { transform: translateX(8px); }
  45% { transform: translateX(-6px); }
  60% { transform: translateX(4px); }
  75% { transform: translateX(-2px); }
}
@keyframes kela-slide-up {
  from { opacity: 0; transform: translateY(40px); }
  65% { opacity: 1; transform: translateY(-4px); }
  to { opacity: 1; transform: none; }
}
@keyframes kela-bump {
  0%, 100% { transform: scale(1); }
  40% { transform: scale(1.22); }
}
@keyframes kela-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}
@keyframes kela-shimmer {
  from { transform: translateX(-100%); }
  to { transform: translateX(250%); }
}
@keyframes kela-confetti {
  0% { opacity: 1; transform: translate3d(0, -10vh, 0) rotate(0deg); }
  100% { opacity: 0.9; transform: translate3d(var(--kx, 0px), 105vh, 0) rotate(var(--kr, 540deg)); }
}

.kela-enter { animation: kela-enter 0.5s cubic-bezier(.2,.8,.3,1.1) backwards; }
.kela-fade { animation: kela-fade 0.35s ease-out backwards; }
.kela-pop { animation: kela-pop 0.45s cubic-bezier(.3,1.4,.5,1) backwards; }
.kela-shake { animation: kela-shake 0.5s ease-in-out backwards; }
.kela-slide-up { animation: kela-slide-up 0.45s cubic-bezier(.2,.9,.3,1.15) backwards; }
.kela-bump { animation: kela-bump 0.4s ease-out; }
.kela-float { animation: kela-float 4s ease-in-out infinite; }
.kela-stagger > * { animation: kela-enter 0.55s cubic-bezier(.2,.8,.3,1.1) backwards; animation-delay: calc(var(--i, 0) * 90ms + var(--kela-stagger-base, 0ms)); }

.kela-shimmer { position: relative; overflow: hidden; }
.kela-shimmer::after {
  content: ''; position: absolute; inset: 0; width: 40%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent);
  animation: kela-shimmer 2.4s ease-in-out infinite;
}

.kela-confetti { pointer-events: none; position: fixed; inset: 0; overflow: hidden; z-index: 60; }
.kela-confetti > span {
  position: absolute; top: 0; width: 10px; height: 14px; border-radius: 3px;
  animation: kela-confetti var(--kd, 2.6s) cubic-bezier(.25,.6,.4,1) var(--kdelay, 0s) both;
}

.kela-reveal-wait { opacity: 0; }

/* Raised buttons that press down when tapped. */
.kela-press { transition: transform 120ms ease, box-shadow 120ms ease, filter 120ms ease; }
.kela-press:active:not(:disabled) { transform: translateY(3px); filter: brightness(0.98); }

@media (prefers-reduced-motion: reduce) {
  .kela-enter, .kela-fade, .kela-pop, .kela-shake, .kela-slide-up, .kela-bump, .kela-float,
  .kela-stagger > *, .kela-shimmer::after, .kela-confetti > span { animation: none !important; }
  .kela-confetti { display: none; }
  .kela-reveal-wait { opacity: 1; }
}
`
