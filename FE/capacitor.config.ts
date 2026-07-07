import type { CapacitorConfig } from '@capacitor/cli'

const remoteUrl =
  process.env.CAP_SERVER_URL ||
  process.env.NEXT_PUBLIC_CAP_SERVER_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  ''

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
