# Capacitor Setup

This FE app is being wrapped as a Capacitor shell without creating a second frontend.

## Model
- Web app remains in `FE/`
- Native shells live in `FE/ios/` and `FE/android/`
- Phase 1 uses a hosted FE URL inside the native shell

## Required env
Set one of these before syncing/opening native platforms:

```bash
CAP_SERVER_URL=https://your-fe-domain.com
```

Fallbacks read by `FE/capacitor.config.ts`:
- `NEXT_PUBLIC_CAP_SERVER_URL`
- `NEXT_PUBLIC_APP_URL`

## Commands
```bash
pnpm --dir FE run cap:add:ios
pnpm --dir FE run cap:add:android
pnpm --dir FE run cap:sync
pnpm --dir FE run cap:open:ios
pnpm --dir FE run cap:open:android
```

## Notes
- `webDir` is a placeholder because phase 1 loads a hosted FE URL.
- Do not static-export the app for this phase; current auth depends on Next route handlers.
- First device tests should focus on auth, audio playback, and microphone recording.
