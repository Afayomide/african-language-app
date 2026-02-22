# Admin FE

## API Flow

The frontend uses a proxy pattern to keep secrets on the server:

UI components
  -> `src/services/*` (client-side API wrappers)
  -> Next.js API routes under `src/app/api/*`
  -> Backend (BE)

This keeps the AI key and backend URL on the server.

## Environment Variables

Create `adminFE/.env.local`:

```
AI_API_KEY=your_long_random_secret
BE_API_URL=http://localhost:5000
NEXT_PUBLIC_API_URL=http://localhost:3000
```

Notes:
- `AI_API_KEY` is server-only (do NOT use `NEXT_PUBLIC_*`).
- `BE_API_URL` points to the backend host.

## Where To Change Routes

All backend URLs are centralized in `src/lib/apiRoutes.ts`.

Client-side services call `fe*Routes` and never hit BE directly.
Server routes use `be*Routes` to call the BE.
