'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { learnerAuthService } from '@/services'
import type { LearnerAuthUser, LearnerProfile } from '@/types'

type LearnerSession = {
  user: LearnerAuthUser
  profile: LearnerProfile
  requiresOnboarding: boolean
}

type AuthActionResult = {
  session: LearnerSession
  message: string
}

type LearnerAuthContextValue = {
  session: LearnerSession | null
  isAuthenticated: boolean
  isLoading: boolean
  refreshSession: () => Promise<LearnerSession | null>
  login: (email: string, password: string) => Promise<AuthActionResult>
  signup: (input: {
    name: string
    email: string
    password: string
    language?: 'yoruba' | 'igbo' | 'hausa'
    dailyGoalMinutes?: number
  }) => Promise<AuthActionResult>
  updateProfile: (input: {
    displayName?: string
    proficientLanguage?: string
    countryOfOrigin?: string
    currentLanguage?: 'yoruba' | 'igbo' | 'hausa'
    dailyGoalMinutes?: number
  }) => Promise<LearnerSession>
  logout: () => Promise<void>
}

const LearnerAuthContext = createContext<LearnerAuthContextValue | null>(null)

function toSession(payload: unknown): LearnerSession | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const record = payload as Record<string, unknown>
  const user = record.user
  const profile = record.profile
  if (!user || typeof user !== 'object' || !profile || typeof profile !== 'object') return null

  return {
    user: user as LearnerAuthUser,
    profile: profile as LearnerProfile,
    requiresOnboarding: Boolean(record.requiresOnboarding),
  }
}

const AUTH_ROUTES = new Set(['/auth/login', '/auth/signup'])
const PUBLIC_ROUTES = new Set(['/', '/auth/login', '/auth/signup'])

export function LearnerAuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [session, setSession] = useState<LearnerSession | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const refreshSession = useCallback(async () => {
    try {
      const payload = await learnerAuthService.me()
      const nextSession = toSession(payload)
      setSession(nextSession)
      return nextSession
    } catch {
      setSession(null)
      return null
    }
  }, [])

  useEffect(() => {
    refreshSession().finally(() => setIsLoading(false))
  }, [refreshSession])

  useEffect(() => {
    if (isLoading) return

    if (!session) {
      if (!PUBLIC_ROUTES.has(pathname)) {
        router.replace('/auth/login')
      }
      return
    }

    if (session.requiresOnboarding && pathname !== '/onboarding') {
      router.replace('/onboarding')
      return
    }

    if (!session.requiresOnboarding && (pathname === '/onboarding' || AUTH_ROUTES.has(pathname))) {
      router.replace('/dashboard')
    }
  }, [isLoading, pathname, router, session])

  const login = useCallback(async (email: string, password: string) => {
    const payload = await learnerAuthService.login(email, password)
    const nextSession = toSession(payload)
    if (!nextSession) {
      throw new Error('Login response is missing learner session data.')
    }
    setSession(nextSession)
    return {
      session: nextSession,
      message:
        typeof payload?.message === 'string' && payload.message.trim()
          ? payload.message
          : 'Signed in successfully.',
    }
  }, [])

  const signup = useCallback(async (input: {
    name: string
    email: string
    password: string
    language?: 'yoruba' | 'igbo' | 'hausa'
    dailyGoalMinutes?: number
  }) => {
    const payload = await learnerAuthService.signup(input)
    const nextSession = toSession(payload)
    if (!nextSession) {
      throw new Error('Signup response is missing learner session data.')
    }
    setSession(nextSession)
    return {
      session: nextSession,
      message:
        typeof payload?.message === 'string' && payload.message.trim()
          ? payload.message
          : 'Account created successfully.',
    }
  }, [])

  const updateProfile = useCallback(async (input: {
    displayName?: string
    proficientLanguage?: string
    countryOfOrigin?: string
    currentLanguage?: 'yoruba' | 'igbo' | 'hausa'
    dailyGoalMinutes?: number
  }) => {
    const payload = await learnerAuthService.updateProfile(input)
    const currentUser = session?.user
    const nextProfile = payload?.profile as LearnerProfile | undefined
    if (!currentUser || !nextProfile) {
      const refreshed = await refreshSession()
      if (!refreshed) {
        throw new Error('Failed to refresh learner session.')
      }
      return refreshed
    }

    const nextSession: LearnerSession = {
      user: currentUser,
      profile: nextProfile,
      requiresOnboarding: Boolean(payload?.requiresOnboarding),
    }
    setSession(nextSession)
    return nextSession
  }, [refreshSession, session?.user])

  const logout = useCallback(async () => {
    await learnerAuthService.logout()
    setSession(null)
    router.replace('/auth/login')
  }, [router])

  const value = useMemo<LearnerAuthContextValue>(() => ({
    session,
    isAuthenticated: Boolean(session),
    isLoading,
    refreshSession,
    login,
    signup,
    updateProfile,
    logout,
  }), [isLoading, login, logout, refreshSession, session, updateProfile, signup])

  const shouldShowLoading = isLoading && !PUBLIC_ROUTES.has(pathname)
  const shouldHideChildren =
    (!isLoading && !session && !PUBLIC_ROUTES.has(pathname)) ||
    Boolean(session?.requiresOnboarding && pathname !== '/onboarding') ||
    Boolean(session && !session.requiresOnboarding && (pathname === '/onboarding' || AUTH_ROUTES.has(pathname)))

  return (
    <LearnerAuthContext.Provider value={value}>
      {shouldShowLoading ? (
        <main className="flex min-h-screen items-center justify-center bg-background px-4">
          <p className="text-sm font-semibold text-foreground/60">Restoring your session...</p>
        </main>
      ) : shouldHideChildren ? null : children}
    </LearnerAuthContext.Provider>
  )
}

export function useLearnerAuth() {
  const context = useContext(LearnerAuthContext)
  if (!context) {
    throw new Error('useLearnerAuth must be used inside LearnerAuthProvider.')
  }
  return context
}
