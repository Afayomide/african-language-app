'use client'

import { useEffect } from 'react'
import { isNativeApp } from '@/lib/platform'

/**
 * Fallback for app builds that don't send the app marker yet: once the page knows it is
 * running inside the native shell, it leaves the marketing page for the app's welcome screen.
 */
export function NativeAppRedirect() {
  useEffect(() => {
    if (isNativeApp()) window.location.replace('/welcome')
  }, [])
  return null
}
