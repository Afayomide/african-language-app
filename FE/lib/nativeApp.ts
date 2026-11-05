/**
 * The native app adds this to its browser identity (see `appendUserAgent` in
 * capacitor.config.ts), so the server can tell the app from a web visitor before it renders.
 */
export const NATIVE_APP_UA_MARKER = 'KelaApp'

export function isNativeAppUserAgent(userAgent: string | null | undefined) {
  return Boolean(userAgent && userAgent.includes(NATIVE_APP_UA_MARKER))
}
