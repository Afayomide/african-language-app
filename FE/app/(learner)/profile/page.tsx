'use client'

import { useEffect, useMemo } from 'react'
import Link from 'next/link'
import { ArrowRight, Flame, Share2, Stars, Trophy } from 'lucide-react'
import { toast } from 'sonner'
import { useLearnerAuth } from '@/components/auth/learner-auth-provider'
import { LearnerHubLayout } from '@/components/learner/learner-hub-layout'
import {
  AchievementCard,
  buildLearnerTagline,
  DEFAULT_LEARNER_AVATAR,
  formatMemberSince,
  LanguageProgressCard,
  LearnerAvatar,
  ProfileStatCard,
} from '@/components/learner/profile-presenters'
import {
  DEFAULT_LEARNER_WEEK,
  WeeklyBars,
} from '@/components/learner/weekly-bars'
import { type LearnerOverviewData as ProfileOverview, useLearnerOverviewQuery } from '@/hooks/queries/learner-overview'

const SETTINGS_TEXTURE = '/images/stitch/settings-ethos-textile.webp'

function languageLabel(value?: string) {
  const normalized = String(value || 'yoruba').trim().toLowerCase()
  if (!normalized) return 'Yoruba'
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

export default function ProfilePage() {
  const { isAuthenticated, isLoading: isAuthLoading, session } = useLearnerAuth()
  const overviewQuery = useLearnerOverviewQuery({
    enabled: !isAuthLoading && isAuthenticated,
  })
  const overview = overviewQuery.data ?? null
  const isLoading = overviewQuery.isLoading || (!overview && overviewQuery.isFetching)

  useEffect(() => {
    if (!overviewQuery.error) return
    toast.error(overviewQuery.error instanceof Error ? overviewQuery.error.message : 'Failed to load profile.')
  }, [overviewQuery.error])

  const languages = useMemo(() => {
    const items = [...(overview?.learnerLanguages || [])]
    return items.sort((a, b) => Number(b.isActive) - Number(a.isActive) || b.totalXp - a.totalXp)
  }, [overview?.learnerLanguages])

  const achievements = overview?.achievements?.length ? overview.achievements : []
  const weeklyOverview = overview?.weeklyOverview?.length ? overview.weeklyOverview : DEFAULT_LEARNER_WEEK
  const name = session?.profile.name || session?.profile.displayName || session?.user.email.split('@')[0] || 'Scholar'
  const avatarUrl = session?.profile.avatarUrl || DEFAULT_LEARNER_AVATAR
  const tagline = buildLearnerTagline(languages, session?.profile.username)
  const memberSince = formatMemberSince(session?.profile.createdAt)
  const currentLanguage = languageLabel(overview?.stats.currentLanguage || session?.profile.currentLanguage)
  const streakDays = overview?.stats.streakDays || 0
  const totalXp = overview?.stats.totalXp || session?.profile.totalXp || 0
  const rank = overview?.stats.globalRank || 0

  async function handleShare() {
    const text = `${name} is learning ${currentLanguage} with a ${streakDays}-day streak and ${totalXp} XP on Tembo.`
    const url = typeof window !== 'undefined' ? window.location.href : undefined
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: `${name}'s Tembo profile`, text, url })
      } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(url || text)
        toast.success('Profile link copied.')
        return
      }
      toast.success('Profile shared.')
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') return
      toast.error('Unable to share profile right now.')
    }
  }

  if (isAuthLoading || isLoading) {
    return (
      <main className="min-h-screen bg-[#fffbff] px-6 py-12 text-[#39382f] md:px-8">
        <div className="mx-auto max-w-7xl animate-pulse space-y-6">
          <div className="h-72 rounded-[2rem] bg-[#f1eee2]" />
          <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
            <div className="h-96 rounded-[2rem] bg-[#f1eee2]" />
            <div className="h-96 rounded-[2rem] bg-[#f1eee2]" />
          </div>
        </div>
      </main>
    )
  }

  return (
    <LearnerHubLayout
      activeNav="profile"
      languageLabel={currentLanguage}
      title="Profile"
      streakDays={streakDays}
    >
      <div className="px-6 pb-12 pt-24 text-[#39382f] lg:px-12 lg:pt-12">
      <div className="mx-auto max-w-7xl space-y-8 lg:hidden">
        <section className="flex flex-col items-center text-center">
          <LearnerAvatar alt={name} size="lg" src={avatarUrl} />
          <h1 className="mt-5 font-display text-[2rem] font-extrabold tracking-[-0.05em] text-[#191713]">{name}</h1>
          <p className="mt-1 text-sm font-medium text-[#66655a]">{tagline}</p>
          <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#8a7d70]">{memberSince}</p>
          <div className="mt-5 flex w-full max-w-xs gap-3">
            <Link
              href="/settings"
              className="flex-1 rounded-xl bg-[linear-gradient(135deg,#a94600,#953d00)] px-5 py-3 text-sm font-bold text-white shadow-[0_14px_26px_rgba(169,70,0,0.22)]"
            >
              Edit Profile
            </Link>
            <button
              type="button"
              onClick={handleShare}
              className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#ece8db] text-[#a94600]"
              aria-label="Share progress"
            >
              <Share2 className="h-4 w-4" />
            </button>
          </div>
        </section>

        <section className="grid grid-cols-3 gap-3">
          <ProfileStatCard accent="primary" compact icon={Flame} label="Day Streak" value={String(streakDays)} />
          <ProfileStatCard accent="secondary" compact icon={Stars} label="XP Earned" value={totalXp.toLocaleString()} />
          <ProfileStatCard accent="tertiary" compact icon={Trophy} label="League Rank" value={rank ? `#${rank}` : '—'} />
        </section>

        <section className="space-y-4">
          <div className="flex items-end justify-between px-1">
            <h2 className="font-display text-[1.35rem] font-bold text-[#191713]">Recent Achievements</h2>
            {achievements.length ? <span className="text-xs font-bold tracking-[0.16em] text-[#a94600]">VIEW ALL</span> : null}
          </div>
          {achievements.length ? (
            <div className="-mx-6 flex gap-4 overflow-x-auto px-6 pb-2">
              {achievements.slice(0, 6).map((achievement: string) => (
                <AchievementCard key={achievement} compact title={achievement} />
              ))}
            </div>
          ) : (
            <div className="rounded-[2rem] bg-[#f7f3ea] p-6 text-sm text-[#66655a]">Complete more lessons to unlock achievements.</div>
          )}
        </section>

        <section className="space-y-4">
          <div className="flex items-end justify-between">
            <h2 className="font-display text-[1.35rem] font-bold text-[#191713]">Active Languages</h2>
            <span className="text-xs font-bold uppercase tracking-[0.16em] text-[#8a7d70]">{languages.length} tracks</span>
          </div>
          <div className="space-y-3">
            {languages.map((language) => (
              <LanguageProgressCard key={language.languageId || language.languageCode} compact language={language} />
            ))}
          </div>
        </section>

        <section className="overflow-hidden rounded-[2rem] bg-[#f7f3ea] p-6">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#8a7d70]">Activity Pulse</p>
              <h2 className="mt-1 font-display text-[1.5rem] font-extrabold text-[#191713]">Weekly Momentum</h2>
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#416f39]">{currentLanguage}</span>
          </div>
          <WeeklyBars compact data={weeklyOverview} />
          <p className="mt-5 text-center text-sm leading-6 text-[#66655a]">
            {streakDays > 0 ? `You are carrying a ${streakDays}-day streak into this week.` : 'Complete a lesson to start building weekly momentum.'}
          </p>
        </section>
      </div>

      <div className="mx-auto hidden max-w-7xl space-y-8 lg:block">
        <section className="grid gap-8 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="rounded-[2rem] bg-[#fdf9f1] p-8 shadow-[0_18px_40px_rgba(57,56,47,0.06)]">
            <div className="flex items-center gap-6">
              <LearnerAvatar alt={name} size="lg" src={avatarUrl} />
              <div className="min-w-0">
                <h1 className="font-display text-[2rem] font-extrabold tracking-[-0.05em] text-[#191713]">{name}</h1>
                <p className="mt-1 text-sm font-medium uppercase tracking-[0.2em] text-[#8a7d70]">{tagline}</p>
                <p className="mt-4 text-sm text-[#66655a]">{memberSince}</p>
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <Link
                href="/settings"
                className="inline-flex flex-1 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#a94600,#ffae86)] px-6 py-3 text-sm font-bold text-white shadow-[0_14px_26px_rgba(169,70,0,0.22)] transition-transform active:translate-y-[2px]"
              >
                Edit Profile
              </Link>
              <button
                type="button"
                onClick={handleShare}
                className="inline-flex items-center justify-center rounded-xl bg-[#ece8db] px-6 py-3 text-sm font-bold text-[#a94600] transition-colors hover:bg-[#e5dfd1]"
              >
                Share Progress
              </button>
            </div>
          </div>

          <section className="rounded-[2rem] bg-[#fdf9f1] p-6 shadow-[0_18px_40px_rgba(57,56,47,0.05)]">
            <div className="mb-5 flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#8a7d70]">Active Languages</p>
              <span className="rounded-full bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#66655a]">{languages.length}</span>
            </div>
            <div className="grid gap-3 xl:grid-cols-2">
              {languages.map((language) => (
                <LanguageProgressCard key={language.languageId || language.languageCode} language={language} />
              ))}
            </div>
          </section>
        </section>

        <div className="space-y-8">
          <section className="grid grid-cols-3 gap-6">
            <ProfileStatCard accent="primary" icon={Flame} label="Day Streak" value={String(streakDays)} />
            <ProfileStatCard accent="secondary" icon={Stars} label="XP Earned" value={totalXp.toLocaleString()} />
            <ProfileStatCard accent="tertiary" icon={Trophy} label="League Rank" value={rank ? `#${rank}` : '—'} />
          </section>

          <section className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-[1.8rem] font-extrabold tracking-[-0.04em] text-[#191713]">Recent Achievements</h2>
              {achievements.length ? (
                <button type="button" className="text-sm font-bold text-[#a94600] transition-colors hover:text-[#8b3900]">
                  View All
                </button>
              ) : null}
            </div>
            {achievements.length ? (
              <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                {achievements.slice(0, 4).map((achievement: string) => (
                  <AchievementCard key={achievement} title={achievement} />
                ))}
              </div>
            ) : (
              <div className="rounded-[2rem] bg-[#fdf9f1] p-8 text-sm text-[#66655a] shadow-[0_18px_40px_rgba(57,56,47,0.05)]">
                Keep learning to unlock achievement milestones.
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-[2rem] bg-[#fdf9f1] shadow-[0_18px_40px_rgba(57,56,47,0.05)]">
            <div className="grid gap-8 p-8 xl:grid-cols-[minmax(0,1fr)_260px] xl:items-end">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#8a7d70]">Activity Pulse</p>
                <h2 className="mt-2 font-display text-[2rem] font-extrabold tracking-[-0.05em] text-[#191713]">Weekly Momentum</h2>
                <p className="mt-2 text-sm leading-6 text-[#66655a]">
                  {streakDays > 0
                    ? `Your ${streakDays}-day streak is active. Keep your pace steady in ${currentLanguage}.`
                    : `Start a new streak by completing your next ${currentLanguage} lesson.`}
                </p>
              </div>
              <div className="relative overflow-hidden rounded-[2rem] bg-[#ece8db] p-5 text-[#39382f]">
                <img alt="" className="absolute inset-0 h-full w-full object-cover opacity-20" src={SETTINGS_TEXTURE} />
                <div className="relative">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#8a7d70]">Current focus</p>
                  <p className="mt-3 font-display text-[1.6rem] font-extrabold text-[#191713]">{currentLanguage}</p>
                  <Link href="/settings" className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-[#8b3900]">
                    Refine profile
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </div>
            <div className="border-t border-[#ece8db] px-8 pb-8 pt-6">
              <WeeklyBars compact={false} data={weeklyOverview} />
            </div>
          </section>
        </div>
      </div>
      </div>
    </LearnerHubLayout>
  )
}
