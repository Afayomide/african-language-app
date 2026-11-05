'use client'

import { useEffect } from 'react'
import { isNativeApp, isAndroidApp } from '@/lib/platform'

/**
 * Makes the web app behave like an installed app when it runs inside the Capacitor shell.
 * - Tags <html> with `native-app`, which turns on app-style CSS in globals.css (no tap
 *   flashes, no long-press text selection, no rubber-band overscroll).
 * - Colours the status bar to match the app and hides the splash screen once ready.
 * - Makes Android's back button go back a screen, and close the app from the first screen.
 * Does nothing in a normal browser.
 */
export function NativeAppShell() {
  useEffect(() => {
    if (!isNativeApp()) return
    document.documentElement.classList.add('native-app')

    let removeBackListener: (() => void) | undefined
    let cancelled = false

    void (async () => {
      try {
        const [{ StatusBar, Style }, { SplashScreen }, { App }] = await Promise.all([
          import('@capacitor/status-bar'),
          import('@capacitor/splash-screen'),
          import('@capacitor/app'),
        ])
        if (cancelled) return

        await StatusBar.setStyle({ style: Style.Light }).catch(() => {})
        if (isAndroidApp()) {
          await StatusBar.setBackgroundColor({ color: '#fffbff' }).catch(() => {})
          await StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {})
        }
        await SplashScreen.hide().catch(() => {})

        const handle = await App.addListener('backButton', ({ canGoBack }) => {
          if (canGoBack) window.history.back()
          else void App.exitApp()
        })
        removeBackListener = () => void handle.remove()
        if (cancelled) removeBackListener()
      } catch (error) {
        console.error('Native app setup failed', error)
      }
    })()

    return () => {
      cancelled = true
      removeBackListener?.()
    }
  }, [])

  return null
}
