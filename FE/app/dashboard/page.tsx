'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  Bell,
  BookOpen,
  BookText,
  ChartColumnBig,
  Check,
  Flame,
  GraduationCap,
  Home,
  Languages,
  LogOut,
  Search,
  Settings,
  Sparkles,
  Star,
  Target,
  User,
  X,
} from 'lucide-react'
import { useLearnerAuth } from '@/components/auth/learner-auth-provider'
import { Logo } from '@/components/branding/logo'
import { LanguageSwitcher, type LearnerLanguageSummary } from '@/components/learner/language-switcher'
import { learnerDashboardService } from '@/services'
import { cn } from '@/lib/utils'

type UnitLesson = {
  id: string
  title: string
  description: string
  level: string
  orderIndex: number
  status: 'not_started' | 'in_progress' | 'completed'
  progressPercent: number
  currentStageIndex?: number
  totalStages?: number
}

type DashboardData = {
  stats: {
    currentLanguage: string
    streakDays: number
    languageStreakDays?: number
    longestStreak?: number
    languageLongestStreak?: number
    totalXp: number
    globalTotalXp?: number
    dailyGoalMinutes: number
    todayMinutes: number
    globalTodayMinutes?: number
    completedLessonsCount?: number
    globalCompletedLessonsCount?: number
  }
  learnerLanguages?: LearnerLanguageSummary[]
  nextLesson: {
    id: string
    unitId?: string
    unitTitle?: string
    title: string
    description: string
    currentStageIndex?: number
    totalStages?: number
    progressPercent?: number
  } | null
  units?: Array<{
    id: string
    title: string
    description: string
    level: string
    orderIndex: number
    progressPercent: number
    completedLessons: number
    totalLessons: number
    lessons: UnitLesson[]
  }>
  completedLessons: {
    id: string
    unitId?: string
    unitTitle?: string
    title: string
    description: string
    level: string
    completedAt: string | null
  }[]
  weeklyOverview: { day: string; completed: boolean; minutes: number }[]
  achievements: string[]
}

type UnitSummary = NonNullable<DashboardData['units']>[number]
type SupportedLanguage = 'yoruba' | 'igbo' | 'hausa'

const LANGUAGE_UI_COPY: Record<
  SupportedLanguage,
  {
    greeting: string
    lessonFallbackTitle: string
    lessonFallbackDescription: string
    moduleFallback: string
    insightTitle: string
    insightBody: string
    proverbTitle: string
    proverbBody: string
    placeholderLessons: Array<{ title: string; description: string }>
  }
> = {
  yoruba: {
    greeting: 'Ẹ káàárọ̀',
    lessonFallbackTitle: 'Greetings',
    lessonFallbackDescription: 'Build confidence with everyday Yoruba greetings and respectful social language.',
    moduleFallback: 'Greetings & Respect',
    insightTitle: 'The Art of Greeting',
    insightBody: 'In Yoruba culture, greetings reflect respect, age, and social context. The way you greet someone matters as much as the words themselves.',
    proverbTitle: 'The Power of Proverb',
    proverbBody:
      '“Owe l’ẹṣin ọ̀rọ̀.” Proverbs are the horses of speech. In Yoruba culture, proverbs carry wisdom and social intelligence.',
    placeholderLessons: [
      { title: 'Ẹ kú àárọ̀', description: 'Good morning' },
      { title: 'Ẹ ṣé', description: 'Thank you' },
      { title: 'Òruń', description: 'Sun / Day' },
      { title: 'Ọjà', description: 'Market' },
    ],
  },
  igbo: {
    greeting: 'Ndewo',
    lessonFallbackTitle: 'Greetings',
    lessonFallbackDescription: 'Practice natural Igbo greetings and respectful expressions for everyday interactions.',
    moduleFallback: 'Greetings & Respect',
    insightTitle: 'Respect in Greeting',
    insightBody: 'Igbo greetings signal warmth, respect, and awareness of social relationships. Good greetings open conversation well.',
    proverbTitle: 'The Wisdom of Saying',
    proverbBody:
      'Traditional sayings carry social meaning and cultural depth. They help learners hear how language holds respect and wisdom.',
    placeholderLessons: [
      { title: 'Ndewo', description: 'Hello / Greetings' },
      { title: 'Daalụ', description: 'Thank you' },
      { title: 'Ụtụtụ ọma', description: 'Good morning' },
      { title: 'Ahịa', description: 'Market' },
    ],
  },
  hausa: {
    greeting: 'Sannu',
    lessonFallbackTitle: 'Greetings',
    lessonFallbackDescription: 'Learn the Hausa greetings and politeness patterns used in real daily conversation.',
    moduleFallback: 'Greetings & Respect',
    insightTitle: 'Greeting with Respect',
    insightBody: 'In Hausa, greetings set the tone for social exchange. They often signal courtesy, wellbeing, and mutual respect.',
    proverbTitle: 'Language and Wisdom',
    proverbBody:
      'Short cultural sayings carry a lot of meaning. They teach how language reflects respect, restraint, and social understanding.',
    placeholderLessons: [
      { title: 'Sannu', description: 'Hello / Welcome' },
      { title: 'Na gode', description: 'Thank you' },
      { title: 'Ina kwana', description: 'Good morning' },
      { title: 'Kasuwa', description: 'Market' },
    ],
  },
}

const HERO_IMAGE =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuDYry1i8BrwmeEaCpCMy3Bw1vjOshZ_cpas35XLOVnyC_dN8BVbnocw1sHiTEQ5FK6QwxXTy3NhXQ5jKitgL-MMBGWHym52IZlU_8tkJkRZifvTrAbG5cUooRUbchmbObEa8DmR6vV9IkOBu8gO6HWRbzY3RfBYp987QbEuYE37omJh4JaNW10Cyv4Qm4cAoosEJAm94aa9TCKKksmGVlVFZjP2IH95upXmZ8MFan4hRFKRIwhZ2teLjf9cVETvtVV41fYvuZbpJKbO'
const CULTURAL_IMAGE =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuCUVH-ssJihozVUeb9l7RSZ-KOWixmgIyLJN88rRVwGiNlGLG7ho2FZ3F8FVGysNl2AVTWwOiXzGdsUxdDO6HxmGR-TVF2LyNtwETEVU09qV2o9PjYVG3brdiB9GQDh06ppiIRbWXGJcXhIoiDivvHo2nX3lBSqNnKh7BDucTzmEwEqudhk8YWZr-yFHqsyR9RuiLSLQh3WupaXWQ1hedBdRtJ3YI8_uYmSxuT2gSGsQWiMzC-zboSeg61pfPN-aPsu0q8-NleU3Zv_'
const HERO_PATTERN =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuDyhWun97SF7KOBU8-z0ViS1Ay4h1RRWgyi88RdTfOXEaWFy8Y3B5M48PPQK69GQERt8CuAt6Ytt_ruy_vJjvwRgg3TK0Vjezo_47xwo9mi_io7Y9Fj93duDjNNTeAX6Bvm_88IAm1CSyBgF_vrWvVEo0MN8QIOofzkvzQbBaldQUwkKoT-YXUNcJeg9qDnRLawD5yl0U2pfKpQUpGgrdtLIaK458MopivaVEMPGGlvqVHLYuEVod2O47XIdIy6hOBpUZaqePkc698d'
const DEFAULT_AVATAR =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuChHsMGj_MWqxZDMDUlyYwVvVcrjDU8deEgWcVtkFJoD-tvNp2dyxs94WERV7pwX_Xzdq62PkBrGD4afYfXJTdfZAbSF9gqcECVjLD23Gp5drdCF-ZcPimXPHdRQuDjlBWRzjIR_JOxQSVC5q-XIbc9dCMPFB9UMuIL_TR8HTQwsqqcVTNwrVVfH4PQsROCSnZDQRTY9nUk-gPBAyasFZdIsnvKZLbABsZUGrVYWQb9P1ypIxJYpcY0yWP-qp_m9f4HKxerXKLzL-OK'

const LESSON_STATUS_LABELS: Record<UnitLesson['status'], string> = {
  not_started: 'Start',
  in_progress: 'Continue',
  completed: 'Review',
}

const DESKTOP_NAV_ITEMS = [
  { label: 'Dashboard', icon: Home, href: '/dashboard', active: true },
  { label: 'Lessons', icon: BookOpen, href: '/learn/spelling', active: false },
  { label: 'Vocabulary', icon: Languages, href: '/learn/word-focus', active: false },
  { label: 'Progress', icon: ChartColumnBig, href: '/dashboard', active: false },
]

const MOBILE_NAV_ITEMS = [
  { label: 'Learn', icon: GraduationCap, href: '/dashboard', active: true, emphasis: true },
  { label: 'Practice', icon: Languages, href: '/learn/translation', active: false, emphasis: true },
  { label: 'Streaks', icon: Flame, href: '/dashboard', active: false, emphasis: true },
  { label: 'Profile', icon: User, href: '/dashboard', active: false, emphasis: true },
]

const DEFAULT_WEEK = [
  { day: 'Mon', completed: false, minutes: 0 },
  { day: 'Tue', completed: false, minutes: 0 },
  { day: 'Wed', completed: false, minutes: 0 },
  { day: 'Thu', completed: false, minutes: 0 },
  { day: 'Fri', completed: false, minutes: 0 },
  { day: 'Sat', completed: false, minutes: 0 },
  { day: 'Sun', completed: false, minutes: 0 },
]

function normalizeLanguage(value?: string): SupportedLanguage {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'igbo' || normalized === 'hausa') return normalized
  return 'yoruba'
}

function titleCaseLanguage(value?: string) {
  const normalized = normalizeLanguage(value)
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

export default function DashboardScreen() {
  const { logout, isLoading: isAuthLoading, isAuthenticated, refreshSession, session } = useLearnerAuth()
  const [data, setData] = useState<DashboardData | null>(null)
  const [expandedUnitId, setExpandedUnitId] = useState('')
  const [isSwitchingLanguage, setIsSwitchingLanguage] = useState(false)

  useEffect(() => {
    if (isAuthLoading || !isAuthenticated || session?.requiresOnboarding) return
    learnerDashboardService
      .getOverview()
      .then((payload) => setData(payload))
      .catch((error) => console.error('Failed to load dashboard', error))
  }, [isAuthLoading, isAuthenticated, session?.requiresOnboarding])

  useEffect(() => {
    if (!data?.units?.length) return
    if (expandedUnitId && data.units.some((unit) => unit.id === expandedUnitId)) return
    setExpandedUnitId(data.units[0].id)
  }, [data?.units, expandedUnitId])

  const activeUnit = useMemo(() => {
    if (!data?.units?.length) return null
    return data.units.find((unit) => unit.id === expandedUnitId) || data.units[0]
  }, [data?.units, expandedUnitId])

  const nextLessonHref = data?.nextLesson ? `/lesson-overview?lessonId=${data.nextLesson.id}` : '/dashboard'
  const dailyPercent = data
    ? Math.min(100, Math.round((data.stats.todayMinutes / Math.max(1, data.stats.dailyGoalMinutes)) * 100))
    : 0
  const completedLessonCount = data?.completedLessons?.length || 0
  const masteryLessons = activeUnit?.lessons.slice(0, 4) || []
  const weeklyOverview = data?.weeklyOverview?.length ? data.weeklyOverview : DEFAULT_WEEK
  const learnerName = session?.profile?.displayName || session?.user?.email?.split('@')[0] || 'Scholar'
  const languageKey = normalizeLanguage(data?.stats.currentLanguage)
  const languageLabel = titleCaseLanguage(data?.stats.currentLanguage)
  const copy = LANGUAGE_UI_COPY[languageKey]

  async function handleLanguageChange(nextLanguage: SupportedLanguage) {
    if (isSwitchingLanguage || nextLanguage === languageKey) return
    setIsSwitchingLanguage(true)
    try {
      await learnerDashboardService.updateLanguage(nextLanguage)
      await refreshSession()
      const payload = await learnerDashboardService.getOverview(nextLanguage)
      setData(payload)
    } catch (error) {
      console.error('Failed to switch learner language', error)
    } finally {
      setIsSwitchingLanguage(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#fffbff] text-[#39382f]">
      <DashboardDesktop
        activeUnit={activeUnit}
        completedLessonCount={completedLessonCount}
        dailyPercent={dailyPercent}
        data={data}
        isSwitchingLanguage={isSwitchingLanguage}
        languageKey={languageKey}
        languageLabel={languageLabel}
        languageCopy={copy}
        learnerName={learnerName}
        masteryLessons={masteryLessons}
        nextLessonHref={nextLessonHref}
        onLogout={() => void logout()}
        onSelectLanguage={handleLanguageChange}
        onSelectUnit={setExpandedUnitId}
        weeklyOverview={weeklyOverview}
      />
      <DashboardMobile
        activeUnit={activeUnit}
        dailyPercent={dailyPercent}
        data={data}
        isSwitchingLanguage={isSwitchingLanguage}
        languageKey={languageKey}
        languageCopy={copy}
        languageLabel={languageLabel}
        nextLessonHref={nextLessonHref}
        onSelectLanguage={handleLanguageChange}
        weeklyOverview={weeklyOverview}
      />
    </main>
  )
}

function DashboardDesktop({
  activeUnit,
  completedLessonCount,
  dailyPercent,
  data,
  isSwitchingLanguage,
  languageKey,
  languageCopy,
  languageLabel,
  learnerName,
  masteryLessons,
  nextLessonHref,
  onLogout,
  onSelectLanguage,
  onSelectUnit,
  weeklyOverview,
}: {
  activeUnit: UnitSummary | null
  completedLessonCount: number
  dailyPercent: number
  data: DashboardData | null
  isSwitchingLanguage: boolean
  languageKey: SupportedLanguage
  languageCopy: (typeof LANGUAGE_UI_COPY)[SupportedLanguage]
  languageLabel: string
  learnerName: string
  masteryLessons: UnitLesson[]
  nextLessonHref: string
  onLogout: () => void
  onSelectLanguage: (language: SupportedLanguage) => void
  onSelectUnit: (unitId: string) => void
  weeklyOverview: DashboardData['weeklyOverview']
}) {
  return (
    <div className="hidden lg:block">
      <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col bg-[#fdf9f1] px-6 py-6">
        <div className="mb-10">
          <Logo href="/dashboard" size="md" className="text-[#3f220f]" />
          <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.22em] text-[#8a7d70]">
            {languageLabel} Scholar
          </p>
        </div>

        <nav className="space-y-1.5">
          {DESKTOP_NAV_ITEMS.map(({ label, icon: Icon, active, href }) => (
            <Link
              key={label}
              href={href}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-[13px] font-bold transition-colors",
                active
                  ? "bg-[#ffeddc] text-[#7b3400]"
                  : "text-[#625f57] hover:bg-[#f6efe5] hover:text-[#7b3400]",
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </Link>
          ))}
        </nav>

        <div className="mt-auto space-y-6">
          <button
            type="button"
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,#a94600,#ffae86)] text-sm font-bold text-white shadow-[0_14px_26px_rgba(169,70,0,0.22)] transition-transform active:scale-[0.99]"
          >
            <Sparkles className="h-4 w-4" />
            Daily Challenge
          </button>

          <div className="flex items-center gap-3 border-t border-[#ebe4db] pt-6">
            <img
              alt="Learner avatar"
              className="h-10 w-10 rounded-full object-cover ring-2 ring-[#a94600]/15"
              src={DEFAULT_AVATAR}
            />
            <div>
              <p className="text-sm font-bold text-[#2d2a23]">{learnerName}</p>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#8a7d70]">
                Scholar level 12
              </p>
            </div>
          </div>
        </div>
      </aside>

      <div className="ml-64 min-h-screen">
        <header className="sticky top-0 z-30 flex h-20 items-center justify-between bg-white/82 px-12 backdrop-blur-xl">
          <h1 className="font-body text-[15px] font-bold text-[#191713]">
            {languageLabel} Learning
          </h1>
          <div className="flex items-center gap-8">
            <label className="relative hidden md:block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#928a81]" />
              <input
                type="text"
                placeholder="Search lessons..."
                className="h-10 w-64 rounded-full border-0 bg-[#f7f3ea] pl-10 pr-4 text-sm text-[#39382f] outline-none ring-0 placeholder:text-[#a59d95]"
              />
            </label>
            <div className="flex items-center gap-4 text-[#6d685f]">
              <button
                type="button"
                className="transition-colors hover:text-[#a94600]"
              >
                <Bell className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="transition-colors hover:text-[#a94600]"
              >
                <Settings className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="transition-colors hover:text-[#a94600]"
                onClick={onLogout}
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-7xl space-y-10 px-12 py-12">
          <section className="flex items-start justify-between gap-6">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#998d81]">Active language</p>
              <h2 className="mt-2 font-display text-[28px] font-extrabold tracking-[-0.04em] text-[#191713]">
                Switch your track
              </h2>
            </div>
            <LanguageSwitcher
              languages={data?.learnerLanguages || []}
              activeLanguage={languageKey}
              disabled={isSwitchingLanguage}
              onSelect={onSelectLanguage}
            />
          </section>

          <section className="grid grid-cols-12 gap-6">
            <div className="relative col-span-8 h-[402px] overflow-hidden rounded-[22px] bg-[#fdf9f1]">
              <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(15,14,11,0.82),rgba(15,14,11,0.48),rgba(15,14,11,0.06))]" />
              <img
                alt="Nigerian marketplace"
                className="h-full w-full object-cover"
                src={HERO_PATTERN}
              />
              <div className="absolute inset-0 flex max-w-[420px] flex-col justify-end px-12 pb-12 text-white">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#ffdeac]">
                  Continue journey
                </p>
                {/* <h2 className="font-display text-[48px] font-extrabold leading-[0.95] tracking-[-0.05em]">
                  {data?.nextLesson?.title || languageCopy.lessonFallbackTitle}
                </h2>
                <p className="mt-4 text-sm font-medium leading-6 text-stone-200">
                  {data?.nextLesson?.description ||
                    languageCopy.lessonFallbackDescription}
                </p> */}
                <h2 className="font-display text-[48px] font-extrabold leading-[0.95] tracking-[-0.05em]">
                  {languageCopy.greeting}
                </h2>
                <p className="mt-4 text-sm font-medium leading-6 text-stone-200">
                  {data?.nextLesson?.description ||
                    languageCopy.lessonFallbackDescription}
                </p>
                <div className="mt-8 flex gap-4">
                  {nextLessonHref && (
                    <Link
                      href={nextLessonHref}
                      className="inline-flex h-12 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#a94600,#ffae86)] px-8 text-sm font-bold text-white shadow-[0_18px_32px_rgba(169,70,0,0.22)]"
                    >
                      Continue Lesson
                    </Link>
                  )}
                  <Link
                    href={`/curriculum?language=${encodeURIComponent(languageKey)}`}
                  >
                    <button
                      type="button"
                      className="inline-flex h-12 items-center justify-center rounded-xl bg-white/10 px-6 text-sm font-bold text-white backdrop-blur-md transition-colors hover:bg-white/20"
                    >
                      Preview
                    </button>
                  </Link>
                </div>
              </div>
            </div>

            <div className="col-span-4 flex flex-col gap-6">
              <StatPanel
                accent="secondary"
                label="Daily streak"
                value={`${data?.stats.streakDays || 0}`}
                suffix="Days"
                footer={`${data?.stats.languageStreakDays || 0} days in ${languageLabel}`}
                icon={Flame}
              />
              <StatPanel
                accent="tertiary"
                label="Total experience"
                value={String(data?.stats.totalXp || 0)}
                suffix="XP"
                progress={dailyPercent}
                footer="150 XP to Level 13"
                icon={Star}
              />
            </div>
          </section>

          <section className="grid grid-cols-12 gap-8">
            <div className="col-span-8 rounded-[28px] bg-[#fdf9f1] p-10">
              <div className="mb-10 flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-display text-[34px] font-extrabold tracking-[-0.04em] text-[#191713]">
                    Momentum
                  </h3>
                  <p className="text-sm font-medium text-[#66655a]">
                    Learning consistency this week
                  </p>
                </div>
                <span className="rounded-lg bg-[#f1eee2] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#625f57]">
                  This week
                </span>
              </div>
              <WeeklyBars data={weeklyOverview} compact={false} />
            </div>

            <div className="col-span-4 rounded-[28px] border border-[#ebe4db] bg-[#fdf9f1] p-8">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#b9eeab]/40 text-[#2d5a27]">
                <BookText className="h-5 w-5" />
              </div>
              <h3 className="mt-8 font-display text-[32px] font-extrabold tracking-[-0.04em] text-[#191713]">
                {activeUnit?.title || languageCopy.proverbTitle}
              </h3>
              <p className="mt-4 text-sm leading-7 text-[#66655a]">
                {activeUnit?.description || languageCopy.proverbBody}
              </p>
              <button
                type="button"
                className="mt-8 inline-flex items-center gap-2 text-sm font-bold text-[#5b2b03] transition-colors hover:text-[#a94600]"
              >
                Explore Oral Traditions
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </section>

          <section>
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#998d81]">
                  Word focus
                </p>
                <h3 className="font-display text-[34px] font-extrabold tracking-[-0.04em] text-[#191713]">
                  Recent Mastery
                </h3>
              </div>
              <Link href="/lesson-expressions">
                <button
                  type="button"
                  className="text-sm font-bold text-[#8b3900] transition-colors hover:text-[#a94600]"
                >
                  View All Vocabulary
                </button>
              </Link>
            </div>
            <div className="grid grid-cols-4 gap-4">
              {(masteryLessons.length > 0
                ? masteryLessons
                : buildPlaceholderLessons(languageKey)
              ).map((lesson) => (
                <div
                  key={lesson.id}
                  className="rounded-2xl bg-[#fdf9f1] px-5 py-4 shadow-[0_1px_0_rgba(235,228,219,0.5)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-[#8b1d48]">
                        {shortWordLabel(lesson.title)}
                      </p>
                      <p className="mt-1 text-xs text-[#8a7d70]">
                        {lesson.description || lesson.level || "Practice"}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "mt-1 flex h-4 w-4 items-center justify-center rounded-full",
                        lesson.status === "completed"
                          ? "bg-[#2d7c37] text-white"
                          : "bg-[#ebe4db] text-[#8a7d70]",
                      )}
                    >
                      {lesson.status === "completed" ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <div className="h-1.5 w-1.5 rounded-full bg-current" />
                      )}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-5 pb-8">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#998d81]">
                  Curriculum
                </p>
                <h3 className="font-display text-[32px] font-extrabold tracking-[-0.04em] text-[#191713]">
                  Your Learning Path
                </h3>
              </div>
              {activeUnit ? (
                <span className="rounded-full bg-[#ffeddc] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#8b3900]">
                  {activeUnit.completedLessons}/{activeUnit.totalLessons}{" "}
                  Complete
                </span>
              ) : null}
            </div>

            {data?.units?.length ? (
              <>
                <div className="flex gap-4 overflow-x-auto pb-2">
                  {data.units.map((unit) => {
                    const active = activeUnit?.id === unit.id;
                    return (
                      <button
                        key={unit.id}
                        type="button"
                        onClick={() => onSelectUnit(unit.id)}
                        className={cn(
                          "min-w-[320px] rounded-[24px] bg-[#fdf9f1] p-5 text-left transition-all",
                          active
                            ? "ring-2 ring-[#ffdeac] shadow-[0_18px_34px_rgba(169,70,0,0.08)]"
                            : "hover:-translate-y-0.5",
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#998d81]">
                              Unit {unit.orderIndex + 1}
                            </p>
                            <h4 className="mt-2 font-display text-xl font-extrabold tracking-[-0.03em] text-[#191713]">
                              {unit.title}
                            </h4>
                          </div>
                          <span className="rounded-full bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#66655a]">
                            {unit.level}
                          </span>
                        </div>
                        <p className="mt-3 text-sm leading-6 text-[#66655a]">
                          {unit.description}
                        </p>
                        <div className="mt-4">
                          <div className="mb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.16em] text-[#8a7d70]">
                            <span>Progress</span>
                            <span>{unit.progressPercent}%</span>
                          </div>
                          <div className="h-2 rounded-full bg-[#ece8db]">
                            <div
                              className="h-2 rounded-full bg-[linear-gradient(90deg,#a94600,#ffae86)]"
                              style={{ width: `${unit.progressPercent}%` }}
                            />
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {activeUnit ? (
                  <div className="grid grid-cols-2 gap-4">
                    {activeUnit.lessons.map((lesson: UnitLesson) => {
                      const isLocked = lesson.status === "not_started";
                      return (
                        <Link
                          key={lesson.id}
                          href={
                            isLocked
                              ? "#"
                              : `/lesson-overview?lessonId=${lesson.id}`
                          }
                          className={cn(isLocked && "pointer-events-none")}
                        >
                          <div className="rounded-[24px] bg-[#fdf9f1] p-5 transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_34px_rgba(57,56,47,0.06)]">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex items-start gap-4">
                                <div
                                  className={cn(
                                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-black",
                                    lesson.status === "completed"
                                      ? "bg-[#2d7c37] text-white"
                                      : lesson.status === "in_progress"
                                        ? "bg-[#a94600] text-white"
                                        : "bg-[#ece8db] text-[#8a7d70]",
                                  )}
                                >
                                  {lesson.status === "completed" ? (
                                    <Check className="h-5 w-5" />
                                  ) : (
                                    lesson.orderIndex + 1
                                  )}
                                </div>
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#998d81]">
                                    Lesson {lesson.orderIndex + 1}
                                  </p>
                                  <h4 className="mt-2 font-display text-xl font-extrabold tracking-[-0.03em] text-[#191713]">
                                    {lesson.title}
                                  </h4>
                                  <p className="mt-2 text-sm leading-6 text-[#66655a]">
                                    {lesson.description ||
                                      "Continue your path."}
                                  </p>
                                </div>
                              </div>
                              <LessonStatusPill status={lesson.status} />
                            </div>
                            <div className="mt-5 flex items-center justify-between border-t border-[#ebe4db] pt-4">
                              <div className="flex gap-2">
                                <span className="rounded-full bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#66655a]">
                                  {lesson.level}
                                </span>
                                {lesson.totalStages ? (
                                  <span className="rounded-full bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#66655a]">
                                    {lesson.totalStages} Stages
                                  </span>
                                ) : null}
                              </div>
                              {!isLocked ? (
                                <span className="inline-flex items-center gap-2 text-sm font-bold text-[#8b3900]">
                                  {LESSON_STATUS_LABELS[lesson.status]}
                                  <ArrowRight className="h-4 w-4" />
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="rounded-[24px] bg-[#fdf9f1] p-8 text-center text-[#66655a]">
                No units available yet.
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function DashboardMobile({
  activeUnit,
  dailyPercent,
  data,
  isSwitchingLanguage,
  languageKey,
  languageCopy,
  languageLabel,
  nextLessonHref,
  onSelectLanguage,
  weeklyOverview,
}: {
  activeUnit: UnitSummary | null
  dailyPercent: number
  data: DashboardData | null
  isSwitchingLanguage: boolean
  languageKey: SupportedLanguage
  languageCopy: (typeof LANGUAGE_UI_COPY)[SupportedLanguage]
  languageLabel: string
  nextLessonHref: string
  onSelectLanguage: (language: SupportedLanguage) => void
  weeklyOverview: DashboardData['weeklyOverview']
}) {
  const nextLesson = data?.nextLesson

  return (
    <div className="lg:hidden">
      <header className="fixed inset-x-0 top-0 z-30 flex h-16 items-center justify-between bg-[#fff7ef]/90 px-6 backdrop-blur-xl">
        <Link href="/dashboard" className="text-[#7c2d12]" aria-label="Home">
          <X className="h-4 w-4" />
        </Link>
        <h1 className="font-display text-sm font-extrabold tracking-[-0.03em] text-[#3f220f]">{languageLabel}</h1>
        <div className="w-4" />
      </header>

      <div className="space-y-8 px-6 pb-28 pt-20">
        <section>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#8a7d70]">Your language journey</p>
          <h2 className="mt-1 font-display text-[34px] font-extrabold tracking-[-0.05em] text-[#191713]">{languageCopy.greeting}</h2>
          <LanguageSwitcher
            languages={data?.learnerLanguages || []}
            activeLanguage={languageKey}
            compact
            className="mt-4"
            disabled={isSwitchingLanguage}
            onSelect={onSelectLanguage}
          />
        </section>

        <section className="relative overflow-hidden rounded-[28px] bg-[linear-gradient(135deg,#a94600,#953d00)] px-6 py-6 text-white shadow-[0_18px_32px_rgba(169,70,0,0.24)]">
          <div className="absolute bottom-0 right-0 h-full w-1/2 opacity-20">
            <img alt="Decorative textile pattern" className="h-full w-full object-cover" src={HERO_PATTERN} />
          </div>
          <div className="relative z-10">
            <div className="mb-10 flex items-start justify-between gap-4">
              <div>
                <h3 className="font-display text-[26px] font-extrabold tracking-[-0.04em]">{languageLabel} Core</h3>
                <p className="text-sm font-medium text-white/80">
                  {activeUnit?.level ? `${activeUnit.level.charAt(0).toUpperCase()}${activeUnit.level.slice(1)}` : 'Beginner'} •{' '}
                  {data?.nextLesson?.unitTitle || activeUnit?.title || languageCopy.moduleFallback}
                </p>
              </div>
              <div className="rounded-2xl bg-white/16 p-3">
                <BookOpen className="h-5 w-5" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-[0.14em] text-white/92">
                <span>Course Progress</span>
                <span>{dailyPercent}%</span>
              </div>
              <div className="h-3 rounded-full bg-white/16 p-[2px]">
                <div className="h-full rounded-full bg-white" style={{ width: `${dailyPercent}%` }} />
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-4">
          <MobileStatCard icon={Flame} label="Streak" value={String(data?.stats.streakDays || 0)} footer="Days active" accent="primary" />
          <MobileStatCard icon={Star} label="XP earned" value={String(data?.stats.totalXp || 0)} footer="Total XP" accent="secondary" />
        </section>

        <section className="rounded-[28px] bg-[#f7f3ea] p-6">
          <div className="mb-6 flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#b9eeab]/55 text-[#2d5a27]">
              <Target className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-display text-[22px] font-extrabold tracking-[-0.04em] text-[#191713]">Next Lesson</h3>
              <p className="text-sm text-[#66655a]">{nextLesson?.unitTitle || activeUnit?.title || languageCopy.moduleFallback}</p>
            </div>
          </div>
          <Link href={nextLessonHref} className="flex items-center justify-between rounded-2xl bg-white px-4 py-4">
            <div className="flex items-center gap-3">
              <span className="text-lg font-bold text-[#a94600]">01</span>
              <span className="text-sm font-bold text-[#191713]">{nextLesson?.title || 'Formal Greetings'}</span>
            </div>
            <ArrowRight className="h-4 w-4 text-[#a59d95]" />
          </Link>
          <Link
            href={nextLessonHref}
            className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#a94600,#953d00)] text-sm font-bold uppercase tracking-[0.08em] text-white shadow-[0_14px_26px_rgba(169,70,0,0.24)]"
          >
            Continue Learning
            <ArrowRight className="h-4 w-4" />
          </Link>
        </section>

        <section className="space-y-4">
          <div className="flex items-end justify-between gap-3">
            <h3 className="font-display text-[26px] font-extrabold tracking-[-0.04em] text-[#191713]">Momentum</h3>
            <span className="text-sm font-bold text-[#416f39]">This Week</span>
          </div>
          <div className="rounded-[28px] bg-[#f7f3ea] p-6">
            <WeeklyBars data={weeklyOverview} compact />
            <p className="mt-5 px-3 text-center text-sm leading-6 text-[#8a7d70]">
              You're just starting. Complete today's lesson to begin your streak and build momentum.
            </p>
          </div>
        </section>

        <section className="pb-2">
          <h3 className="mb-4 font-display text-[26px] font-extrabold tracking-[-0.04em] text-[#191713]">Cultural Insight</h3>
          <div className="overflow-hidden rounded-[28px] bg-[#f7f3ea]">
            <div className="h-40 w-full overflow-hidden">
              <img alt="Traditional Yoruba fabric" className="h-full w-full object-cover" src={CULTURAL_IMAGE} />
            </div>
            <div className="p-6">
              <span className="inline-flex rounded-full bg-[#b9eeab]/55 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#2d5a27]">
                Tradition
              </span>
              <h4 className="mt-3 font-display text-[24px] font-extrabold tracking-[-0.04em] text-[#191713]">{languageCopy.insightTitle}</h4>
              <p className="mt-2 text-sm leading-6 text-[#66655a]">
                {languageCopy.insightBody}
              </p>
              <button type="button" className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-[#8b3900]">
                Read more
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 rounded-t-3xl border-t border-[#ebe4db] bg-[#fff7ef]/95 px-4 pb-6 pt-3 shadow-[0_-8px_24px_rgba(175,75,6,0.06)] backdrop-blur-2xl">
        <div className="flex justify-around">
          {MOBILE_NAV_ITEMS.map(({ label, icon: Icon, href, active, emphasis }) => {
            const strong = emphasis && active
            return (
              <Link
                key={label}
                href={href}
                className={cn(
                  'flex min-w-[4.5rem] flex-col items-center justify-center rounded-2xl px-3 py-2 text-[10px] font-bold uppercase tracking-widest transition-all',
                  strong ? 'scale-105 bg-[linear-gradient(135deg,#c2410c,#9a3412)] text-white shadow-md' : 'text-[#78716c] opacity-80 hover:opacity-100',
                )}
              >
                <Icon className={cn('h-5 w-5', strong ? 'text-white' : '')} strokeWidth={strong ? 2.2 : 1.8} />
                <span className="mt-1 tracking-widest">{label}</span>
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}

function StatPanel({
  accent,
  footer,
  icon: Icon,
  label,
  progress,
  suffix,
  value,
}: {
  accent: 'secondary' | 'tertiary'
  footer: string
  icon: typeof Flame
  label: string
  progress?: number
  suffix: string
  value: string
}) {
  const accentClasses =
    accent === 'secondary'
      ? {
          iconWrap: 'bg-[#ffdeac] text-[#6e4b00]',
          footerWrap: 'bg-[#ffdeac] text-[#6e4b00]',
          progress: 'bg-[#865d00]',
        }
      : {
          iconWrap: 'bg-[#b9eeab]/55 text-[#2d5a27]',
          footerWrap: 'bg-transparent text-[#66655a]',
          progress: 'bg-[#416f39]',
        }

  return (
    <div className="flex-1 rounded-[24px] bg-[#f7f3ea] p-8">
      <div className="mb-10 flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#8a7d70]">{label}</p>
          <div className="mt-4 flex items-end gap-2">
            <span className="font-display text-[56px] font-extrabold leading-none tracking-[-0.05em] text-[#191713]">{value}</span>
            <span className="pb-2 text-sm font-bold text-[#8a7d70]">{suffix}</span>
          </div>
        </div>
        <div className={cn('flex h-12 w-12 items-center justify-center rounded-2xl', accentClasses.iconWrap)}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
      {typeof progress === 'number' ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.16em] text-[#8a7d70]">
            <span>Daily goal</span>
            <span>{footer}</span>
          </div>
          <div className="h-2 rounded-full bg-[#ece8db]">
            <div className={cn('h-2 rounded-full', accentClasses.progress)} style={{ width: `${Math.max(progress, 8)}%` }} />
          </div>
        </div>
      ) : (
        <div className={cn('inline-flex items-center gap-3 rounded-xl px-4 py-3 text-xs font-bold', accentClasses.footerWrap)}>
          <Icon className="h-4 w-4" />
          {footer}
        </div>
      )}
    </div>
  )
}

function WeeklyBars({ data, compact }: { data: DashboardData['weeklyOverview']; compact: boolean }) {
  const normalized = data.length ? data : DEFAULT_WEEK
  const maxMinutes = Math.max(...normalized.map((item) => item.minutes), 1)
  const todayKey = new Date().toLocaleDateString('en-GB', { weekday: 'short' }).slice(0, 3).toLowerCase()

  return (
    <div className={cn('flex items-end justify-between gap-3', compact ? 'h-48' : 'h-56 px-4')}>
      {normalized.map((item) => {
        const shortDay = item.day.slice(0, 3)
        const isToday = shortDay.toLowerCase() === todayKey
        const ratio = item.minutes > 0 ? item.minutes / maxMinutes : 0
        const barHeight = compact ? Math.max(32, Math.round(32 + ratio * 88)) : Math.max(40, Math.round(40 + ratio * 132))

        return (
          <div key={item.day} className="flex flex-1 flex-col items-center gap-3">
            <div className={cn('relative w-full overflow-hidden rounded-full bg-[#ece8db]', compact ? 'h-full max-h-[132px]' : 'h-full max-h-[180px]')}>
              <div
                className={cn(
                  'absolute bottom-0 inset-x-0 rounded-full',
                  isToday
                    ? 'bg-[linear-gradient(180deg,#ffae86,#a94600)]'
                    : item.minutes > 0
                      ? 'bg-[#d9cfc0]'
                      : 'bg-transparent',
                )}
                style={{ height: `${barHeight}px` }}
              />
            </div>
            <span className={cn('text-[10px] font-bold uppercase', isToday ? 'text-[#a94600]' : 'text-[#8a7d70]')}>{shortDay}</span>
          </div>
        )
      })}
    </div>
  )
}

function MobileStatCard({
  accent,
  footer,
  icon: Icon,
  label,
  value,
}: {
  accent: 'primary' | 'secondary'
  footer: string
  icon: typeof Flame
  label: string
  value: string
}) {
  return (
    <div className="aspect-square rounded-[28px] bg-[#fdf9f1] p-5">
      <div className="flex h-full flex-col justify-between">
        <div className="flex items-start justify-between gap-3">
          <Icon className={cn('h-7 w-7', accent === 'primary' ? 'text-[#a94600]' : 'text-[#865d00]')} />
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8a7d70]">{label}</span>
        </div>
        <div>
          <span className="font-display text-[44px] font-extrabold leading-none tracking-[-0.05em] text-[#191713]">{value}</span>
          <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.16em] text-[#8a7d70]">{footer}</p>
        </div>
      </div>
    </div>
  )
}

function LessonStatusPill({ status }: { status: UnitLesson['status'] }) {
  if (status === 'completed') {
    return <span className="rounded-full bg-[#edf7ea] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#2d7c37]">Done</span>
  }
  if (status === 'in_progress') {
    return <span className="rounded-full bg-[#ffeddc] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#8b3900]">Live</span>
  }
  return <span className="rounded-full bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#8a7d70]">Up next</span>
}

function buildPlaceholderLessons(language: SupportedLanguage): UnitLesson[] {
  return LANGUAGE_UI_COPY[language].placeholderLessons.map((item, orderIndex) => ({
    id: `placeholder-${language}-${orderIndex + 1}`,
    title: item.title,
    description: item.description,
    level: 'Beginner',
    orderIndex,
    status: orderIndex < 3 ? 'completed' : 'not_started',
    progressPercent: orderIndex < 3 ? 100 : 0,
  }))
}

function shortWordLabel(input: string) {
  const trimmed = input.trim()
  if (!trimmed) return 'Practice'
  return trimmed.length > 18 ? `${trimmed.slice(0, 18)}…` : trimmed
}
