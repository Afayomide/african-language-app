import { beLearnerRoutes } from '@/lib/apiRoutes'
import { createLearnerAuthHeaders } from '@/lib/learnerAuthCookies'
import { readJsonResponse } from '@/lib/learnerProxy'

type LearnerServerSession = {
  user: unknown
  profile: unknown
  requiresOnboarding: boolean
}

function isSessionPayload(value: unknown): value is LearnerServerSession {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return Boolean(record.user && record.profile)
}

export async function getLearnerServerSession() {
  const headers = await createLearnerAuthHeaders()
  if (!headers.get('authorization')) return null

  try {
    const response = await fetch(beLearnerRoutes.me(), {
      headers,
      cache: 'no-store',
    })
    if (!response.ok) return null

    const payload = await readJsonResponse(response)
    return isSessionPayload(payload) ? payload : null
  } catch {
    return null
  }
}
