'use client'

import Link from 'next/link'
import {
  BarChart3,
  Bell,
  BookOpen,
  GraduationCap,
  Home,
  Languages,
  LogOut,
  Search,
  Settings,
  Sparkles,
  Flame,
  User,
} from 'lucide-react'
import { useLearnerAuth } from '@/components/auth/learner-auth-provider'
import { Logo } from '@/components/branding/logo'
import { cn } from '@/lib/utils'

export type LearnerHubNavId = 'dashboard' | 'lessons' | 'vocabulary' | 'progress'

const DEFAULT_AVATAR =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuChHsMGj_MWqxZDMDUlyYwVvVcrjDU8deEgWcVtkFJoD-tvNp2dyxs94WERV7pwX_Xzdq62PkBrGD4afYfXJTdfZAbSF9gqcECVjLD23Gp5drdCF-ZcPimXPHdRQuDjlBWRzjIR_JOxQSVC5q-XIbc9dCMPFB9UMuIL_TR8HTQwsqqcVTNwrVVfH4PQsROCSnZDQRTY9nUk-gPBAyasFZdIsnvKZLbABsZUGrVYWQb9P1ypIxJYpcY0yWP-qp_m9f4HKxerXKLzL-OK'

type LearnerHubLayoutProps = {
  children: React.ReactNode
  activeNav: LearnerHubNavId
  languageLabel: string
  /** Top bar: default title (e.g. Yoruba Learning) */
  title?: string
  /** Optional progress 0–100 in the desktop header (Stitch word-focus hub) */
  headerProgressPercent?: number
  streakDays?: number
}

const NAV = [
  { id: 'dashboard' as const, label: 'Dashboard', icon: Home, href: '/dashboard' },
  { id: 'lessons' as const, label: 'Lessons', icon: BookOpen, href: '/learn/spelling' },
  { id: 'vocabulary' as const, label: 'Vocabulary', icon: Languages, href: '/learn/word-focus' },
  { id: 'progress' as const, label: 'Progress', icon: BarChart3, href: '/dashboard' },
]

function mobileTabForNav(activeNav: LearnerHubNavId): 'learn' | 'practice' | 'streaks' | 'profile' {
  if (activeNav === 'dashboard') return 'learn'
  if (activeNav === 'progress') return 'streaks'
  return 'practice'
}

export function LearnerHubLayout({
  children,
  activeNav,
  languageLabel,
  title = 'Yoruba Learning',
  headerProgressPercent,
  streakDays,
}: LearnerHubLayoutProps) {
  const { logout, session } = useLearnerAuth()
  const learnerName = session?.profile?.displayName || session?.user?.email?.split('@')[0] || 'Scholar'
  const streak = streakDays ?? 0
  const mobileTab = mobileTabForNav(activeNav)

  return (
    <div className="min-h-screen bg-[#fffbff] text-[#39382f]">
      {/* Desktop shell — Stitch 06–08 */}
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-64 flex-col bg-[#fff7ef] px-6 py-6 lg:flex">
        <div className="mb-10">
          <Logo href="/dashboard" size="md" className="text-[#7c2d12]" />
          <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.22em] text-[#998d81]">{languageLabel} Scholar</p>
        </div>
        <nav className="space-y-1.5">
          {NAV.map(({ id, label, icon: Icon, href }) => {
            const active = activeNav === id
            return (
              <Link
                key={id}
                href={href}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-xs font-bold uppercase tracking-wider transition-colors',
                  active ? 'bg-[#ffeddc] text-[#7b3400]' : 'text-[#625f57] hover:bg-[#f6efe5] hover:text-[#7b3400]',
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </Link>
            )
          })}
        </nav>
        <div className="mt-auto space-y-6 pt-6">
          <Link
            href="/dashboard"
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,#a94600,#ffae86)] text-sm font-bold text-white shadow-[0_14px_26px_rgba(169,70,0,0.22)] transition-transform active:scale-[0.99]"
          >
            <Sparkles className="h-4 w-4" />
            Daily Challenge
          </Link>
          <div className="flex items-center gap-3 border-t border-[#ebe4db] pt-6">
            <img alt="" className="h-10 w-10 rounded-full object-cover ring-2 ring-[#a94600]/15" src={DEFAULT_AVATAR} />
            <div>
              <p className="text-sm font-bold text-[#2d2a23]">{learnerName}</p>
              <button
                type="button"
                onClick={() => void logout()}
                className="mt-0.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#8a7d70] hover:text-[#a94600]"
              >
                <LogOut className="h-3 w-3" />
                Sign out
              </button>
            </div>
          </div>
        </div>
      </aside>

      <div className="lg:ml-64">
        <header className="sticky top-0 z-30 hidden h-20 items-center justify-between bg-white/82 px-8 backdrop-blur-xl lg:flex lg:px-12">
          <div className="flex min-w-0 items-center gap-8">
            <h1 className="font-body text-xl font-bold uppercase tracking-tight text-[#191713]">{title}</h1>
            {typeof headerProgressPercent === 'number' ? (
              <div className="hidden h-2 w-48 overflow-hidden rounded-full bg-[#ece8db] xl:block">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,#a94600,#ffae86)]"
                  style={{ width: `${Math.min(100, Math.max(0, headerProgressPercent))}%` }}
                />
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-6">
            {streak > 0 ? (
              <div className="flex items-center gap-2 rounded-full bg-[#f7f3ea] px-4 py-2">
                <Flame className="h-4 w-4 fill-[#a94600] text-[#a94600]" />
                <span className="text-sm font-bold">{streak} Day Streak</span>
              </div>
            ) : null}
            <label className="relative hidden xl:block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#928a81]" />
              <input
                type="search"
                placeholder="Search lessons..."
                className="h-10 w-56 rounded-full border-0 bg-[#f7f3ea] pl-10 pr-4 text-sm outline-none placeholder:text-[#a59d95]"
              />
            </label>
            <button type="button" className="text-[#6d685f] transition-colors hover:text-[#a94600]" aria-label="Notifications">
              <Bell className="h-4 w-4" />
            </button>
            <button type="button" className="text-[#6d685f] transition-colors hover:text-[#a94600]" aria-label="Settings">
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="pb-28 lg:pb-12">{children}</div>
      </div>

      {/* Mobile top bar — hub only; not used on /study */}
      <header className="fixed inset-x-0 top-0 z-30 flex h-16 items-center justify-between bg-[#fff7ef]/90 px-5 backdrop-blur-xl lg:hidden">
        <Link href="/dashboard" className="text-[#7c2d12]" aria-label="Back to dashboard">
          <Home className="h-5 w-5" />
        </Link>
        <span className="font-display text-sm font-extrabold text-[#3f220f]">{languageLabel}</span>
        <div className="w-5" />
      </header>

      <nav className="fixed inset-x-0 bottom-0 z-30 rounded-t-3xl border-t border-[#ebe4db] bg-[#fff7ef]/95 px-4 pb-6 pt-3 shadow-[0_-8px_24px_rgba(175,75,6,0.06)] backdrop-blur-2xl lg:hidden">
        <div className="flex justify-around">
          <MobileNavLink href="/dashboard" active={mobileTab === 'learn'} icon={GraduationCap} label="Learn" emphasis />
          <MobileNavLink href="/learn/translation" active={mobileTab === 'practice'} icon={Languages} label="Practice" emphasis />
          <MobileNavLink href="/dashboard" active={mobileTab === 'streaks'} icon={Flame} label="Streaks" emphasis />
          <MobileNavLink href="/dashboard" active={mobileTab === 'profile'} icon={User} label="Profile" emphasis />
        </div>
      </nav>
    </div>
  )
}

function MobileNavLink({
  href,
  active,
  icon: Icon,
  label,
  emphasis,
}: {
  href: string
  active: boolean
  icon: typeof Home
  label: string
  emphasis?: boolean
}) {
  const strong = emphasis && active
  return (
    <Link
      href={href}
      className={cn(
        'flex min-w-[4.5rem] flex-col items-center justify-center rounded-2xl px-3 py-2 text-[10px] font-bold uppercase tracking-widest transition-all',
        strong ? 'scale-105 bg-[linear-gradient(135deg,#c2410c,#9a3412)] text-white shadow-md' : 'text-[#78716c] opacity-80 hover:opacity-100',
      )}
    >
      <Icon className={cn('h-5 w-5', strong ? 'text-white' : '')} strokeWidth={strong ? 2.2 : 1.8} />
      <span className="mt-1">{label}</span>
    </Link>
  )
}
