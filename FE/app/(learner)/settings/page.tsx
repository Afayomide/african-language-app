'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { LogOut } from 'lucide-react'
import { toast } from 'sonner'
import { useLearnerAuth } from '@/components/auth/learner-auth-provider'
import { LearnerHubLayout } from '@/components/learner/learner-hub-layout'
import { DEFAULT_LEARNER_AVATAR, formatMemberSince } from '@/components/learner/profile-presenters'
import { invalidateLearnerOverview } from '@/hooks/queries/learner-overview'
import { cn } from '@/lib/utils'

const TEXTILE_ART = '/images/stitch/settings-ethos-textile.webp'

function languageLabel(value?: string) {
  const normalized = String(value || 'yoruba').trim().toLowerCase()
  if (!normalized) return 'Yoruba'
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

function normalizeUsernameInput(value: string) {
  return String(value || '').trim().replace(/^@+/, '').toLowerCase()
}

function isEmailLike(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim())
}

function SettingsField({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  prefix,
  autoComplete,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  placeholder?: string
  prefix?: string
  autoComplete?: string
}) {
  return (
    <label className="block space-y-2">
      <span className="block text-sm font-bold text-[#66655a]">{label}</span>
      <div className="relative">
        {prefix ? (
          <span className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 font-bold text-[#bcb9ad]">{prefix}</span>
        ) : null}
        <input
          autoComplete={autoComplete}
          className={cn(
            'w-full rounded-2xl border-0 bg-white px-5 py-4 text-[15px] font-medium text-[#191713] shadow-[inset_0_0_0_1px_rgba(236,232,219,0.9)] outline-none transition focus:shadow-[inset_0_0_0_2px_rgba(169,70,0,0.45)]',
            prefix ? 'pl-10' : '',
          )}
          placeholder={placeholder}
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    </label>
  )
}

export default function SettingsPage() {
  const { changePassword, logout, session, updateProfile, isLoading: isAuthLoading } = useLearnerAuth()
  const queryClient = useQueryClient()
  const [isDesktopViewport, setIsDesktopViewport] = useState(false)
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  
  const snapshot = useMemo(() => ({
    name: session?.profile.name || session?.profile.displayName || '',
    username: session?.profile.username || '',
    email: session?.user.email || '',
    avatarUrl: session?.profile.avatarUrl || '',
  }), [session?.profile.avatarUrl, session?.profile.name, session?.profile.displayName, session?.profile.username, session?.user.email])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 1024px)')
    const syncViewport = () => setIsDesktopViewport(mediaQuery.matches)
    syncViewport()
    mediaQuery.addEventListener('change', syncViewport)
    return () => mediaQuery.removeEventListener('change', syncViewport)
  }, [])

  useEffect(() => {
    setName(snapshot.name)
    setUsername(snapshot.username)
    setEmail(snapshot.email)
    setAvatarUrl(snapshot.avatarUrl)
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
  }, [snapshot])

  const profileDirty =
    name.trim() !== snapshot.name ||
    normalizeUsernameInput(username) !== snapshot.username ||
    email.trim().toLowerCase() !== snapshot.email.toLowerCase() ||
    avatarUrl.trim() !== snapshot.avatarUrl

  const hasAnyPasswordInput = Boolean(currentPassword.trim() || newPassword.trim() || confirmPassword.trim())
  const hasCompletePasswordInput = Boolean(currentPassword.trim() && newPassword.trim() && confirmPassword.trim())
  const canSave = profileDirty || hasAnyPasswordInput
  const memberSince = formatMemberSince(session?.profile.createdAt)
  const avatarPreview = avatarUrl.trim() || DEFAULT_LEARNER_AVATAR
  const currentLanguage = languageLabel(session?.profile.currentLanguage)

  function handleDiscard() {
    setName(snapshot.name)
    setUsername(snapshot.username)
    setEmail(snapshot.email)
    setAvatarUrl(snapshot.avatarUrl)
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    toast.message('Changes discarded.')
  }

  function handleAvatarEdit() {
    const next = window.prompt('Paste the avatar image URL', avatarUrl || '')
    if (next === null) return
    setAvatarUrl(next.trim())
  }

  async function handleSave() {
    if (!canSave) {
      toast.message('No changes to save.')
      return
    }

    const trimmedName = name.trim()
    const normalizedUsername = normalizeUsernameInput(username)
    const trimmedEmail = email.trim().toLowerCase()
    const trimmedAvatar = avatarUrl.trim()

    if (!trimmedName) {
      toast.error('Name is required.')
      return
    }

    if (normalizedUsername && normalizedUsername.length < 3) {
      toast.error('Username must be at least 3 characters.')
      return
    }

    if (!isEmailLike(trimmedEmail)) {
      toast.error('Enter a valid email address.')
      return
    }

    if (hasCompletePasswordInput) {
      if (newPassword.length < 8) {
        toast.error('New password must be at least 8 characters.')
        return
      }
      if (newPassword !== confirmPassword) {
        toast.error('New password and confirmation do not match.')
        return
      }
    }

    setIsSaving(true)
    try {
      let profileSaved = false
      if (profileDirty) {
        await updateProfile({
          avatarUrl: trimmedAvatar,
          name: trimmedName,
          email: trimmedEmail,
          username: normalizedUsername,
        })
        await invalidateLearnerOverview(queryClient)
        profileSaved = true
      }
      if (hasCompletePasswordInput) {
        await changePassword({ currentPassword, newPassword })
      }
      if (hasCompletePasswordInput) {
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
        toast.success(profileSaved ? 'Settings updated.' : 'Password updated.')
      } else if (profileSaved) {
        toast.success('Profile updated.')
      } else if (hasAnyPasswordInput) {
        toast.error('Fill all password fields to change your password.')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save settings.')
    } finally {
      setIsSaving(false)
    }
  }

  if (isAuthLoading) {
    return (
      <main className="min-h-screen bg-[#fffbff] px-6 py-12 md:px-8">
        <div className="mx-auto max-w-5xl animate-pulse space-y-6">
          <div className="h-24 rounded-[2rem] bg-[#f1eee2]" />
          <div className="h-[680px] rounded-[2rem] bg-[#f1eee2]" />
        </div>
      </main>
    )
  }

  return (
    <LearnerHubLayout
      activeNav="settings"
      languageLabel={currentLanguage}
      title="Settings"
    >
      <div className="px-6 pb-12 pt-24 text-[#39382f] lg:px-12 lg:pt-12">
      {isDesktopViewport ? (
      <div className="mx-auto max-w-5xl">
        <div className="rounded-[2rem] bg-[#fdf9f1] p-8 shadow-[0_18px_40px_rgba(57,56,47,0.06)]">
          <div className="mx-auto max-w-2xl rounded-[2rem] bg-white p-12">
            <div className="space-y-10">
                <section className="space-y-8">
                  <h2 className="font-display text-[1.75rem] font-bold text-[#191713]">Account Information</h2>
                  <div className="flex items-center gap-6">
                    <div className="relative">
                      <div className="h-24 w-24 overflow-hidden rounded-[1.5rem] border-4 border-[#ece8db] bg-[#ffdeac]">
                        <img alt={name || 'Learner profile'} className="h-full w-full object-cover" src={avatarPreview} />
                      </div>
                      <button
                        type="button"
                        onClick={handleAvatarEdit}
                        className="absolute -bottom-2 -right-2 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#a94600] text-white shadow-[0_12px_24px_rgba(169,70,0,0.22)] transition-transform active:translate-y-[2px]"
                        aria-label="Edit avatar"
                      >
                        <span className="material-symbols-outlined text-[18px]">edit</span>
                      </button>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-[#191713]">{name || 'Learner'}</h3>
                      <p className="text-sm text-[#66655a]">{memberSince}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <SettingsField autoComplete="name" label="Name" value={name} onChange={setName} />
                    <SettingsField autoComplete="username" label="Username" prefix="@" value={username} onChange={setUsername} />
                  </div>
                  <SettingsField autoComplete="email" label="Email Address" type="email" value={email} onChange={setEmail} />
                </section>

                <section className="space-y-6 border-t border-[#ece8db] pt-8">
                  <h2 className="font-display text-[1.5rem] font-bold text-[#191713]">Update Password</h2>
                  <SettingsField autoComplete="current-password" label="Current Password" placeholder="••••••••" type="password" value={currentPassword} onChange={setCurrentPassword} />
                  <div className="grid grid-cols-2 gap-6">
                    <SettingsField autoComplete="new-password" label="New Password" type="password" value={newPassword} onChange={setNewPassword} />
                    <SettingsField autoComplete="new-password" label="Confirm Password" type="password" value={confirmPassword} onChange={setConfirmPassword} />
                  </div>
                </section>

                <div className="flex justify-end pt-4">
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={handleSave}
                    className="rounded-xl bg-[linear-gradient(135deg,#a94600,#ffae86)] px-10 py-4 text-lg font-bold text-white shadow-[0_16px_30px_rgba(169,70,0,0.26)] transition-transform hover:scale-[1.01] active:translate-y-[2px] disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
            </div>
          </div>
        </div>
      </div>
      ) : (
      <div className="mx-auto max-w-3xl space-y-8">
        <div className="text-center">
          <h1 className="font-display text-[2.4rem] font-extrabold tracking-[-0.05em] text-[#a94600]">Refine Your Ethos</h1>
          <p className="mt-2 text-sm font-medium text-[#66655a]">Manage your identity and security within the digital archive.</p>
        </div>

        <section className="rounded-[2rem] bg-[#fdf9f1] p-8 shadow-[0_18px_40px_rgba(57,56,47,0.05)]">
          <div className="mb-8 flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#ffeddc] text-[#a94600]">
              <span className="material-symbols-outlined material-symbols-filled text-[20px]">person_edit</span>
            </span>
            <h2 className="text-xs font-black uppercase tracking-[0.18em] text-[#8a7d70]">Account Information</h2>
          </div>

          <div className="mb-6 flex items-center gap-4">
            <div className="relative">
              <div className="h-20 w-20 overflow-hidden rounded-[1.5rem] border-4 border-[#ece8db] bg-[#ffdeac]">
                <img alt={name || 'Learner profile'} className="h-full w-full object-cover" src={avatarPreview} />
              </div>
              <button
                type="button"
                onClick={handleAvatarEdit}
                className="absolute -bottom-1 -right-1 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#a94600] text-white shadow-[0_12px_24px_rgba(169,70,0,0.22)] transition-transform active:translate-y-[2px]"
                aria-label="Edit avatar"
              >
                <span className="material-symbols-outlined text-[18px]">edit</span>
              </button>
            </div>
            <div>
              <p className="font-bold text-[#191713]">{name || 'Learner'}</p>
              <p className="text-sm text-[#66655a]">{memberSince}</p>
            </div>
          </div>

          <div className="space-y-6">
            <SettingsField autoComplete="name" label="Full Name" value={name} onChange={setName} />
            <SettingsField autoComplete="username" label="Username" prefix="@" value={username} onChange={setUsername} />
            <SettingsField autoComplete="email" label="Email Address" type="email" value={email} onChange={setEmail} />
          </div>
        </section>

        <section className="rounded-[2rem] bg-[#fdf9f1] p-8 shadow-[0_18px_40px_rgba(57,56,47,0.05)]">
          <div className="mb-8 flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#ffeddc] text-[#a94600]">
              <span className="material-symbols-outlined material-symbols-filled text-[20px]">security</span>
            </span>
            <h2 className="text-xs font-black uppercase tracking-[0.18em] text-[#8a7d70]">Security &amp; Access</h2>
          </div>

          <div className="space-y-6">
            <SettingsField autoComplete="current-password" label="Current Password" placeholder="Current password" type="password" value={currentPassword} onChange={setCurrentPassword} />
            <SettingsField autoComplete="new-password" label="New Password" placeholder="Min. 8 characters" type="password" value={newPassword} onChange={setNewPassword} />
            <SettingsField autoComplete="new-password" label="Confirm New Password" placeholder="Repeat new password" type="password" value={confirmPassword} onChange={setConfirmPassword} />
          </div>
        </section>

        <div className="relative h-48 overflow-hidden rounded-[2rem]">
          <img alt="" className="h-full w-full object-cover" src={TEXTILE_ART} />
          <div className="absolute inset-0 bg-gradient-to-r from-[#a94600]/80 to-transparent px-8 py-6 text-white">
            <p className="max-w-[240px] font-display text-lg italic">“Words are like eggs: when they drop, they cannot be gathered.”</p>
          </div>
        </div>

        <div className="flex flex-col gap-4 pb-8">
          <button type="button" onClick={handleDiscard} className="order-2 px-6 py-3 text-sm font-bold text-[#8a7d70] transition-colors hover:text-[#a94600]">
            Discard Changes
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={handleSave}
            className="order-1 rounded-2xl bg-[linear-gradient(135deg,#a94600,#953d00)] px-8 py-4 text-base font-bold text-white shadow-[0_16px_30px_rgba(169,70,0,0.26)] transition-transform hover:scale-[1.01] active:translate-y-[2px] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
          <button type="button" onClick={() => void logout()} className="order-3 inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-6 py-3 text-sm font-bold text-[#b23d21] shadow-[0_10px_22px_rgba(57,56,47,0.05)]">
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </div>
      )}
      </div>
    </LearnerHubLayout>
  )
}
