# Capacitor Setup

This FE app is being wrapped as a Capacitor shell without creating a second frontend.

## Model
- Web app remains in `FE/`
- Native shells live in `FE/ios/` and `FE/android/`
- Phase 1 uses a hosted FE URL inside the native shell

## Server URL
By default the shell loads the production FE at `https://tembolang.vercel.app`.
To point it elsewhere (e.g. a local dev server), set one of these before syncing:

```bash
CAP_SERVER_URL=http://192.168.x.x:3001
```

Fallbacks read by `FE/capacitor.config.ts`:
- `NEXT_PUBLIC_CAP_SERVER_URL`
- `NEXT_PUBLIC_APP_URL`

Use `https://` for hosted URLs. With `http://`, the host's redirect to `https://` counts as
leaving the app, so Capacitor opens it in the external browser and the shell stays blank.

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
