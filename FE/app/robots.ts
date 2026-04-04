import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/seo'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/auth/',
          '/dashboard',
          '/curriculum',
          '/daily-goal',
          '/exercise',
          '/language-selection',
          '/learn/',
          '/lesson-complete',
          '/lesson-expressions',
          '/lesson-overview',
          '/lesson-phrases',
          '/listening-exercise',
          '/onboarding',
          '/profile',
          '/review',
          '/sentence-builder',
          '/settings',
          '/study',
        ],
      },
    ],
    sitemap: [`${siteUrl.toString().replace(/\/$/, '')}/sitemap.xml`],
  }
}
