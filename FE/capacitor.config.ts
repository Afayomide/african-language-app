import type { CapacitorConfig } from '@capacitor/cli'

// The production FE on Vercel. Set CAP_SERVER_URL to point the shell elsewhere,
// e.g. a local dev server when testing on a device.
const DEFAULT_SERVER_URL = 'https://tembolang.vercel.app'

const remoteUrl =
  process.env.CAP_SERVER_URL ||
  process.env.NEXT_PUBLIC_CAP_SERVER_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  DEFAULT_SERVER_URL

const config: CapacitorConfig = {
  appId: process.env.CAP_APP_ID || 'com.kela.app',
  appName: process.env.CAP_APP_NAME || 'Kela',
  webDir: 'www',
  // Lets the website recognise the app (see FE/lib/nativeApp.ts) and open the app's own
  // welcome screen instead of the marketing page.
  appendUserAgent: 'KelaApp',
  backgroundColor: '#fffbff',
  ios: {
    // Keep page content out from under the notch and the home bar.
    contentInset: 'always',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#fffbff',
      showSpinner: false,
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#fffbff',
      overlaysWebView: false,
    },
  },
  server: remoteUrl
    ? {
        url: remoteUrl,
        cleartext: remoteUrl.startsWith('http://'),
      }
    : undefined,
}

export default config
