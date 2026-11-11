# OmniAssist AI

An IT support copilot for the fictional Omni Corp. Employees ask questions in plain language and get a streamed answer with numbered sources. The assistant searches the company knowledge base first and falls back to the web only when the knowledge base cannot answer. Admins manage the knowledge base; conversations are saved per user so follow-ups work and past chats can be reopened.

Deployment (Vercel, VPS, DNS, Clerk, CI) is covered in [`deploy/README.md`](deploy/README.md).

## Repository layout

| Path | What it is |
| --- | --- |
| `apps/api` | Hono API: `/api/v1/ask` event stream, conversations, knowledge-base documents, Inngest ingestion, OpenAPI at `/api/docs` |
| `apps/web` | Next.js app: chat, History, Knowledge Base page, Clerk sign-in |
| `packages/rag-graph` | LangGraph pipeline: follow-up rewrite, routing, retrieval, grading, web fallback, answer |
| `packages/rag-core` | Pinecone vector store |
| `packages/ingestion` | Text extraction (PDF, Word, Markdown, text) and chunking. Holds the Omni Corp sample corpus in `fixtures/` |
| `packages/db` | Drizzle schema and migrations (Neon Postgres) |
| `packages/types` | Zod schemas and types shared by the API and the web app |
| `packages/ui` | Shared UI components |
| `scripts` | `ask` and `seed-kb` command-line helpers |
| `deploy` | VPS bundle: Compose file, Caddyfile, env template, runbook |

## Requirements

- Node 24 and pnpm 10 (`corepack enable`)
- Accounts for Neon, Clerk, Cloudflare R2, Pinecone, Inngest, OpenAI, Typesafe (Jev) and Tavily

## Setup

```sh
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

Fill both files, then apply the database migrations:

```sh
pnpm --filter @omni/db db:migrate
```

Start everything (API on port 3000, web on port 3001):

```sh
pnpm dev
```

Open `http://localhost:3001`. Signed-out visits redirect to `/sign-in`.

### API environment (`apps/api/.env`)

The API exits at startup, naming the variable, if a required one is missing. Values are never printed.

| Variable | Required | Purpose |
| --- | --- | --- |
| `NODE_ENV` | no | `development`, `test` or `production` |
| `PORT` | no | Listen port (default `3000`) |
| `LOG_LEVEL` | no | Pino level, `fatal` through `silent` (default `info`) |
| `WEB_ORIGINS` | yes | Comma-separated exact web origins allowed for CORS and Clerk. Include `http://localhost:3001` |
| `DATABASE_URL` | yes | Neon pooled Postgres URL |
| `DATABASE_URL_DIRECT` | for migrations | Neon direct URL, used by Drizzle Kit in `@omni/db` |
| `CLERK_SECRET_KEY` / `CLERK_PUBLISHABLE_KEY` | yes | Clerk keys (`sk_…`, `pk_…`) |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` | yes | Cloudflare R2 storage for uploads (`R2_ENDPOINT` optional) |
| `PINECONE_API_KEY` / `PINECONE_INDEX` | yes | Pinecone document index. `chunk_text` is embedded by Pinecone (`text-embedding-3-small`, 1536, cosine). `title` is English full-text |
| `INNGEST_SIGNING_KEY` / `INNGEST_EVENT_KEY` | yes | Inngest keys. The serve URL is `/api/inngest` |
| `INNGEST_DEV` | no | Set to `1` locally to use the Inngest dev server: `npx inngest-cli@latest dev -u http://127.0.0.1:3000/api/inngest` |
| `KB_MAX_UPLOAD_BYTES` | no | Max upload size (default `10485760`) |
| `OPENAI_API_KEY` / `OPENAI_ANSWER_MODEL` | yes | OpenAI key and the model that streams answers (no default model) |
| `TYPESAFE_API_KEY` | yes | Typesafe key for the Jev router and graders |
| `TAVILY_API_KEY` | yes | Tavily key for web search |
| `TYPESAFE_MODEL` | no | Jev model id (default `jev-1.14.0`) |
| `KB_RETRIEVAL_TOP_K` | no | Chunks retrieved per question, 1 to 20 (default `8`) |
| `ASK_TIMEOUT_MS` | no | Whole-request deadline (default `60000`) |

In the Clerk dashboard, set the session token claim `metadata` to `{{user.public_metadata}}`. Give one development user `public_metadata.role` of `admin`; everyone else is a `member`.

### Web environment (`apps/web/.env.local`)

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | API origin the browser calls, for example `http://localhost:3000` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` | Keys from the same Clerk instance as the API |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` / `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/sign-in` and `/sign-up` |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` / `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` | `/` |
| `E2E_CLERK_USER_EMAIL` | Optional. The signed-in Playwright tests use this user; otherwise the Clerk user with `public_metadata.role` of `admin` |

## Using the product

### Chat

The Home page (`/`) is the chat screen for every signed-in user. Press Enter to send, Shift+Enter for a new line.

- Progress ("Searching the knowledge base", and so on) shows until the first words arrive; the answer then streams in.
- Sources are numbered under the answer, with a badge for where the answer came from and its confidence. Fallback answers say they are not backed by company documents; direct answers show no confidence.
- Stop ends the request and keeps the text so far. Failures show a friendly message with a retry and, when available, a support reference.
- Completed answers are saved. Follow-ups continue the same conversation, and the assistant uses the six most recent exchanges as context. A conversation holds at most 100 exchanges.
- History (in the toolbar) lists saved conversations, newest first, and lets you reopen, rename or delete them. New chat starts a fresh conversation. Reloading shows an empty chat.

### Knowledge Base (admins)

`/knowledge-base` lets admins upload, retry and delete documents (PDF, Word, Markdown, text). Uploads are stored in R2, then an Inngest job (`kb-ingest-document`, event `kb/document.uploaded`) extracts, chunks and indexes them in Pinecone. Members see a forbidden state.

### Ask API

`POST /api/v1/ask` takes `{ "question": "…", "conversationId"?: "…" }` (1 to 2000 characters, any signed-in user) and answers with a server-sent event stream: `status`, `citations`, `token`, then `done` (or `error`). Omit `conversationId` to start a conversation, or send the id from a previous `done` to continue it. An unknown or foreign id is a 404 and a full conversation is a 409, both before the stream starts. Saved conversations are managed with `/api/v1/conversations`. The full contract is at `/api/docs`.

## Command-line helpers

Run these from the repository root.

```sh
pnpm ask --help
pnpm ask --dry-run "How do I set up the VPN?"
ASK_BEARER_TOKEN=<clerk-session-jwt> pnpm ask "How do I set up the VPN?"
```

`pnpm ask` prints the answer to stdout and stages, sources and the time to first token to stderr. `ASK_API_URL` defaults to `http://127.0.0.1:3000`.

```sh
pnpm seed-kb --help
pnpm seed-kb --dry-run
SEED_BEARER_TOKEN=<admin-clerk-jwt> SEED_API_URL=http://127.0.0.1:3000 pnpm seed-kb
pnpm seed-kb --with-adversarial   # dev knowledge base only
```

`seed-kb` uploads the 29 fictional Omni Corp documents in `packages/ingestion/fixtures/omni-corp`. `--with-adversarial` adds a prompt-injection note and a superseded policy for testing grading. Evaluation questions with expected answers are in `packages/ingestion/fixtures/omni-corp-eval-set.md`.

## Scripts

| Script | What it does |
| --- | --- |
| `pnpm dev` | API and web app together |
| `pnpm build` | Build every package |
| `pnpm lint` / `pnpm lint:fix` | ESLint |
| `pnpm typecheck` | `tsc --noEmit` everywhere |
| `pnpm test` | Vitest, in process, with no network |
| `pnpm test:e2e` | Playwright (needs the Clerk test setup, not a running API) |
| `pnpm --filter @omni/api start` | Run the built API (export the env vars first; it does not load `.env`) |
| `pnpm --filter @omni/db db:generate` | Generate a migration after a schema change |

## Health checks

- `GET /api/health` returns 200 without touching the database
- `GET /api/ready` reports the database. R2, Pinecone and Inngest failures surface on document operations or as a `failed` document status
- `GET /api/docs` opens the Scalar API reference
