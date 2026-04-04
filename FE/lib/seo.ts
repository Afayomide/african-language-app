import type { Metadata } from 'next'

function resolveSiteUrl() {
  const rawUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

  try {
    return new URL(rawUrl)
  } catch {
    return new URL('http://localhost:3000')
  }
}

export const siteUrl = resolveSiteUrl()
export const siteName = 'Kela'
export const siteDescription =
  'Learn African Languages through culture, conversation, and AI-powered daily practice.'
export const defaultOgImage = '/icon-512.png'

export function buildNoIndexMetadata(title: string, description?: string): Metadata {
  return {
    title,
    description,
    robots: {
      index: false,
      follow: false,
      googleBot: {
        index: false,
        follow: false,
        'max-image-preview': 'none',
        'max-snippet': -1,
        'max-video-preview': -1,
      },
    },
  }
}
