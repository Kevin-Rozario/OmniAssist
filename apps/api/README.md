# @omni/api

Hono API for OmniAssist AI. Versioned routes live under `/v1`. Health, readiness, OpenAPI, and the docs UI are unversioned and public.

## Setup

From the repository root, on Node 24:

```sh
pnpm install
cp apps/api/.env.example apps/api/.env
```

Fill `apps/api/.env`:

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | `development`, `test`, or `production` |
| `PORT` | Listen port. Local default is `3000` |
| `LOG_LEVEL` | Pino level (`fatal` through `silent`) |
| `WEB_ORIGINS` | Comma-separated web origins allowed for CORS and Clerk. Include `http://localhost:3001` |
| `DATABASE_URL` | Neon pooled Postgres URL |
| `DATABASE_URL_DIRECT` | Neon direct URL, used by Drizzle Kit in `@omni/db` |
| `CLERK_SECRET_KEY` | Clerk secret key (`sk_test_…`) |
| `CLERK_PUBLISHABLE_KEY` | Clerk publishable key (`pk_test_…`) |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` | Cloudflare R2 object storage for KB uploads (`R2_ENDPOINT` optional) |
| `PINECONE_API_KEY` / `PINECONE_INDEX` | Pinecone document index. `chunk_text` is embedded by Pinecone (`text-embedding-3-small`, 1536, cosine). `title` is English full-text. |
| `INNGEST_SIGNING_KEY` / `INNGEST_EVENT_KEY` | Inngest Cloud keys; serve URL is `/api/inngest` |
| `INNGEST_DEV` | Optional. Set to `1` locally to use the Inngest dev server (`npx inngest-cli@latest dev -u http://127.0.0.1:3000/api/inngest`) |
| `KB_MAX_UPLOAD_BYTES` | Max upload size (default `10485760`) |

In the Clerk dashboard, set the session token claim `metadata` to `{{user.public_metadata}}`. Give one development user `public_metadata.role` of `admin`. Everyone else is treated as `member`.

Apply database migrations when `DATABASE_URL_DIRECT` points at the dev branch:

```sh
pnpm --filter @omni/db db:migrate
```

This creates `kb_documents` (and any later tables). `/ready` still only pings Postgres; R2/Pinecone/Inngest failures surface on document operations or as `failed` status.

## Scripts

Run these from the repository root:

| Script | What it does |
| --- | --- |
| `pnpm --filter @omni/api dev` | `tsx watch`, loading `apps/api/.env` when it exists |
| `pnpm --filter @omni/api build` | Bundle to `dist/` with tsdown |
| `pnpm --filter @omni/api start` | Run `dist/index.js` (export the env vars first; this script does not load `.env`) |
| `pnpm --filter @omni/api lint` | ESLint |
| `pnpm --filter @omni/api typecheck` | `tsc --noEmit` |
| `pnpm --filter @omni/api test` | Vitest, in process, with no network |

`pnpm dev` from the root starts this API and the web app together.

## Check

- `GET http://localhost:3000/health` returns 200
- `GET http://localhost:3000/ready` reports the database
- `GET http://localhost:3000/docs` opens the Scalar reference
- With the web app signed in, the shell reads `GET /v1/me`
