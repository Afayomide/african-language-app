import { Capacitor } from '@capacitor/core'

export type AppPlatform = 'web' | 'ios' | 'android'

export function getAppPlatform(): AppPlatform {
  const platform = Capacitor.getPlatform()
  return platform === 'ios' || platform === 'android' ? platform : 'web'
}

export function isNativeApp() {
  return Capacitor.isNativePlatform()
}

export function isIOSApp() {
  return getAppPlatform() === 'ios'
}

export function isAndroidApp() {
  return getAppPlatform() === 'android'
}
