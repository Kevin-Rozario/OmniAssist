# @omni/web

Next.js app for OmniAssist AI. Signed-in pages use the responsive shell and load the current user from the API.

## Setup

From the repository root, on Node 24:

```sh
pnpm install
cp apps/web/.env.example apps/web/.env.local
```

Fill `apps/web/.env.local`:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | API origin the browser calls, for example `http://localhost:3000` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key (`pk_test_…`) |
| `CLERK_SECRET_KEY` | Clerk secret key (`sk_test_…`) |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/sign-up` |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` | `/` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` | `/` |

Use the same Clerk development instance as `apps/api`. The API's `WEB_ORIGINS` must include this app's origin (`http://localhost:3001`).

Optional, for the signed-in Playwright test: `E2E_CLERK_USER_EMAIL`. When it is unset, the test uses the Clerk user whose `public_metadata.role` is `admin`.

## Scripts

Run these from the repository root:

| Script | What it does |
| --- | --- |
| `pnpm --filter @omni/web dev` | Dev server on port 3001 |
| `pnpm --filter @omni/web build` | Production build |
| `pnpm --filter @omni/web start` | Serve the production build on port 3001 |
| `pnpm --filter @omni/web lint` | ESLint |
| `pnpm --filter @omni/web typecheck` | `tsc --noEmit` |
| `pnpm --filter @omni/web test` | Vitest |
| `pnpm --filter @omni/web test:e2e` | Playwright |

`pnpm dev` from the root starts this app and the API together.

## Local walkthrough

1. Start the API (`apps/api/README.md`) so `http://localhost:3000` is up.
2. `pnpm --filter @omni/web dev`
3. Open `http://localhost:3001`. Signed-out visits redirect to `/sign-in`.
4. Sign in. The header shows the display name returned by `GET /v1/me`, plus an Admin badge when the role is `admin`.
