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
  server: remoteUrl
    ? {
        url: remoteUrl,
        cleartext: remoteUrl.startsWith('http://'),
      }
    : undefined,
}

export default config
