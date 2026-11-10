# Delivery

The web app is hosted on Vercel. The API image is published to GHCR and run on the VPS behind the Caddy that is already installed on the host. This directory is the VPS bundle. Nothing here is applied automatically.

| File | Purpose |
| --- | --- |
| `compose.yml` | API container, published only on `127.0.0.1:3000` |
| `Caddyfile` | Host Caddy config: existing site plus the API host |
| `api.env.example` | Template for the API environment |
| `README.md` | This runbook |

`api.env` is created on the server from the example. It is gitignored. Do not commit it.

## Hostnames

`kevinrozario.com` is the existing site. Each product owns a subdomain. This product is `omniassist`. Its API is a host under that name, so another product can use the same shape (`other.kevinrozario.com`, `api.other.kevinrozario.com`).

| Surface | Hostname | Where it runs |
| --- | --- | --- |
| Web | `omniassist.kevinrozario.com` | Vercel, public HTTPS on 443 |
| API | `api.omniassist.kevinrozario.com` | VPS, host Caddy on 80 and 443 |
| Clerk | `clerk.omniassist.kevinrozario.com` | Clerk, for this secondary application |

The browser calls the API directly. `WEB_ORIGINS` is a comma-separated list of exact origins and does not accept wildcards.

## Ports

| Process | Port | Published |
| --- | --- | --- |
| Caddy already on the VPS | 80 and 443 | Yes. Do not start another Caddy |
| API container | 3000 | Only on `127.0.0.1`, so the host Caddy can reach it |
| Vercel (web) | 443 | Yes, by Vercel |

Local development stays API `3000` and web `3001`.

There is no `ACME_EMAIL` variable. The Caddy installed at `/etc/caddy` already has a certificate account. Compose does not run Caddy and does not bind 80 or 443.

## DNS

At the DNS host for `kevinrozario.com`:

- `api.omniassist` — A record to the VPS public IPv4. Add an AAAA record when the VPS has IPv6.
- `omniassist` — CNAME to `cname.vercel-dns.com` after the domain is added in the Vercel project.
- Clerk — every record shown on the Clerk Domains page for this secondary application. Those names sit under `omniassist.kevinrozario.com`, including `clerk.omniassist`. Verification mail is sent from `@omniassist.kevinrozario.com`.

The API name gets its certificate when Caddy reloads, so `api.omniassist` must resolve to this VPS first.

## Clerk

This product is a secondary Clerk application. Users open `omniassist.kevinrozario.com`. Clerk's API stays on `clerk.omniassist.kevinrozario.com`.

Use the production keys (`pk_live_…` and `sk_live_…`) from that same application in both places:

- `deploy/api.env` on the VPS (`CLERK_SECRET_KEY` and `CLERK_PUBLISHABLE_KEY`)
- the Vercel project (`CLERK_SECRET_KEY` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`)

In the Clerk dashboard, allow `https://omniassist.kevinrozario.com` and each Vercel preview origin that should sign in.

## First boot

On the VPS:

```sh
git clone --branch production --single-branch https://github.com/Kevin-Rozario/OmniAssist.git
cd OmniAssist/deploy
cp api.env.example api.env
```

Edit `api.env`: Neon pooled URL, the production Clerk keys, `WEB_ORIGINS=https://omniassist.kevinrozario.com`, and the knowledge-base variables from `api.env.example` (R2, Pinecone, OpenAI, Inngest).

The GHCR package is private even though the repository is public. Log in once with a GitHub personal access token that has `read:packages`. The password is that token, not the GitHub account password. Docker stores it in `~/.docker/config.json`. Do not put the token in `api.env`.

```sh
docker login ghcr.io -u kevin-rozario
docker compose pull
docker compose up -d
curl -fsS http://127.0.0.1:3000/health
```

The local curl must succeed before Caddy changes. Then install the Caddyfile. It keeps `kevinrozario.com` and `www.kevinrozario.com` serving `/var/www/html`, and adds the API host:

```sh
sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak
sudo cp Caddyfile /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

## Later releases

From `~/OmniAssist` on the `production` branch:

```sh
git pull
cd deploy
docker compose pull
docker compose up -d
```

`IMAGE_TAG` defaults to `latest`. To roll out a specific build:

```sh
IMAGE_TAG=<commit-sha> docker compose pull
IMAGE_TAG=<commit-sha> docker compose up -d
```

After changing `api.env`, recreate the API container:

```sh
docker compose up -d --force-recreate
```

Reload Caddy only when `deploy/Caddyfile` changed. Repeat the copy, validate, and reload from the first boot.

## Rollback

`latest` moves. Roll back by starting the previous commit SHA, which the image workflow also pushes:

```sh
IMAGE_TAG=<previous-commit-sha> docker compose pull
IMAGE_TAG=<previous-commit-sha> docker compose up -d
```

The API container is limited to 512 MB. Raise `mem_limit` in `compose.yml` if the kernel OOM-kills it. Certificates stay with the host Caddy, not in a Compose volume.

## Knowledge base and Inngest

Document upload and ingestion need services that are not covered by `/ready` (that probe stays Postgres-only). Provision them before admins use the Knowledge Base page:

| Service | What to create | Env vars in `api.env` |
| --- | --- | --- |
| Cloudflare R2 | Private bucket + S3 API token (Object Read & Write) | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, optional `R2_ENDPOINT` |
| Pinecone | Serverless index, **1536** dimensions, **cosine** metric | `PINECONE_API_KEY`, `PINECONE_INDEX` |
| OpenAI | API key for `text-embedding-3-small` embeddings | `OPENAI_API_KEY` |
| Inngest Cloud | App whose serve URL is `https://api.omniassist.kevinrozario.com/api/inngest` | `INNGEST_SIGNING_KEY`, `INNGEST_EVENT_KEY` |
| Upload cap | Optional override (default 10 MiB) | `KB_MAX_UPLOAD_BYTES` |

After the API container is up with Inngest keys, open the Inngest dashboard and sync/register the app so `kb/ingest-document` is listed. Until sync succeeds, uploads create `pending` rows but ingestion jobs will not run. Recreate the container after editing these vars (`docker compose up -d --force-recreate`).

Local seed of the Omni Corp Markdown corpus (dev only, not for production CI):

```sh
pnpm seed-kb --help
pnpm seed-kb --dry-run
SEED_BEARER_TOKEN=<admin-clerk-jwt> SEED_API_URL=http://127.0.0.1:3000 pnpm seed-kb
```

## Checks

```sh
curl -fsS https://api.omniassist.kevinrozario.com/health
curl -fsS https://api.omniassist.kevinrozario.com/ready
curl -fsSI https://api.omniassist.kevinrozario.com/docs
```

`/health` returns `{"status":"ok"}` and does not touch the database. `/ready` returns `{"status":"ok","checks":{"database":"ok"}}` only when `select 1` succeeds. `/docs` returns HTTP 200 with `content-type: text/html` and a `via: 1.1 Caddy` header. `/api/inngest` is the Inngest serve path (authenticated by Inngest signing key, not Clerk).

Logs:

```sh
docker compose logs -f api
```

## GitHub

`main` is the integration branch. `production` is the release branch. The VPS clone tracks `production`.

CI (`.github/workflows/ci.yml`) runs on every pull request and on pushes to `main` and `production`. It installs with pnpm, restores the Turborepo cache from GitHub Actions cache, then runs `turbo run lint typecheck test build`. Playwright runs only when a push or pull request changes `apps/web/**` or `packages/ui/**`.

Repository secrets, all optional:

| Secret | Effect when absent |
| --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | The signed-out Playwright page still boots with a placeholder key. The Clerk widget may not render, so the sign-in assertion can fail. |
| `CLERK_SECRET_KEY` | The signed-in Playwright test is skipped. |
| `E2E_CLERK_USER_EMAIL` | The signed-in test looks up the admin user itself when this is unset and the secret is present. |

`.github/workflows/api-image.yml` runs only on pushes to `production`. It pushes `ghcr.io/kevin-rozario/omniassist-api:<commit-sha>` and `:latest`. A push to `main` does not publish an image.

## Vercel

Create one project from `Kevin-Rozario/OmniAssist`. Do not add `vercel.json`. Set the project in the dashboard.

| Setting | Value |
| --- | --- |
| Production Branch | `production` |
| Node.js Version | `24.x` |
| Root Directory | `apps/web` |
| Framework | Next.js |
| Install Command | `cd ../.. && pnpm install --frozen-lockfile` |
| Build Command | `cd ../.. && pnpm turbo run build --filter=@omni/web` |
| Production domain | `omniassist.kevinrozario.com` |

Set these for Production. Use the production Clerk keys from the secondary application. For a Preview deployment, use the matching Clerk instance: development keys unless that preview is meant to use production.

| Variable | Production value |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | `https://api.omniassist.kevinrozario.com` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_live_…` |
| `CLERK_SECRET_KEY` | `sk_live_…` |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/sign-up` |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` | `/` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` | `/` |

After the first production deployment, open `https://omniassist.kevinrozario.com`. A signed-out visit redirects to `/sign-in`.

`WEB_ORIGINS` in `deploy/api.env` must include every browser origin that calls the API. Recreate the container after editing it. Include:

- `https://omniassist.kevinrozario.com`
- the production `*.vercel.app` origin, if visitors still use it
- each preview origin that should call the API, copied exactly from that deployment

A preview URL changes per branch. Paste the one you need. There is no wildcard entry.
