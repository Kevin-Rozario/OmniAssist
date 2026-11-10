# Delivery

The web app is hosted on Vercel. The API image is published to GHCR and run on the VPS behind Caddy. This directory is the VPS bundle. Nothing here is applied automatically.

## Hostnames

`kevinrozario.com` is shared. Each product owns a subdomain. This product is `omniassist`. Its API is a host under that name, so another product can use the same shape (`other.kevinrozario.com`, `api.other.kevinrozario.com`).

| Surface | Hostname                         | Where it runs               |
| ------- | -------------------------------- | --------------------------- |
| Web     | `omniassist.kevinrozario.com`    | Vercel, public HTTPS on 443 |
| API     | `api.omniassist.kevinrozario.com` | VPS, Caddy on 80 and 443    |

The browser calls the API directly. `WEB_ORIGINS` is a list of exact origins and does not accept wildcards.

## Ports

| Process       | Port       | Published                                 |
| ------------- | ---------- | ----------------------------------------- |
| Vercel (web)  | 443        | Yes, by Vercel                            |
| Caddy         | 80 and 443 | Yes, on the VPS                           |
| API container | 3000       | No. Only the Compose network can reach it |

Local development stays API `3000` and web `3001`.

## DNS

At the DNS host for `kevinrozario.com`:

- `api.omniassist` — A record to the VPS public IPv4. Add an AAAA record when the VPS has IPv6.
- `omniassist` — CNAME to `cname.vercel-dns.com` after the domain is added in the Vercel project.

Caddy obtains the API certificate over HTTP-01, so ports 80 and 443 must reach the VPS before the first boot.

## VPS files

On the VPS, keep this directory together:

```sh
cp .env.example .env
cp api.env.example api.env
```

Edit `.env` and replace `ACME_EMAIL=you@kevinrozario.com` with a mailbox you read. Edit `api.env` with the Neon pooled URL, the Clerk production keys, and `WEB_ORIGINS`.

`api.env` is gitignored. `.env` is gitignored by the root `.env*` rule.

The image is private on GHCR until you change that. Log in once on the VPS with a GitHub token that has `read:packages`:

```sh
echo "$GHCR_TOKEN" | docker login ghcr.io -u kevin-rozario --password-stdin
```

## Rollout

From this directory:

```sh
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
docker compose up -d --force-recreate api
```

## Rollback

`latest` moves. Roll back by starting the previous commit SHA, which the image workflow also pushes:

```sh
IMAGE_TAG=<previous-commit-sha> docker compose pull
IMAGE_TAG=<previous-commit-sha> docker compose up -d
```

The API container is limited to 512 MB. Raise `mem_limit` in `compose.yaml` if the kernel OOM-kills it. Caddy keeps certificates in the `caddy-data` volume, so a recreate does not request a new account.

## Checks

```sh
curl -fsS https://api.omniassist.kevinrozario.com/health
curl -fsS https://api.omniassist.kevinrozario.com/ready
curl -fsSI https://api.omniassist.kevinrozario.com/docs
```

`/health` is liveness and does not touch the database. `/ready` returns 200 only when `select 1` succeeds. `/docs` should answer over HTTPS with a certificate for `api.omniassist.kevinrozario.com`.

Logs:

```sh
docker compose logs -f api
```

## GitHub

`main` is the integration branch. `production` is the release branch. CI (`.github/workflows/ci.yml`) runs on every pull request and on pushes to `main` and `production`. It installs with pnpm, restores the Turborepo cache from GitHub Actions cache, then runs `turbo run lint typecheck test build`. Playwright runs only when a push or pull request changes `apps/web/**` or `packages/ui/**`.

Repository secrets, all optional:

| Secret                              | Effect when absent                                                                                                                     |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | The signed-out Playwright page still boots with a placeholder key. The Clerk widget may not render, so the sign-in assertion can fail. |
| `CLERK_SECRET_KEY`                  | The signed-in Playwright test is skipped.                                                                                              |
| `E2E_CLERK_USER_EMAIL`              | The signed-in test looks up the admin user itself when this is unset and the secret is present.                                        |

`.github/workflows/api-image.yml` runs only on pushes to `production`. It pushes `ghcr.io/kevin-rozario/omniassist-api:<commit-sha>` and `:latest`. A push to `main` does not publish an image.

## Vercel

Create one project from this repository. Do not add `vercel.json`; set the project in the dashboard.

| Setting           | Value                                                 |
| ----------------- | ----------------------------------------------------- |
| Root Directory    | `apps/web`                                            |
| Framework         | Next.js                                               |
| Install Command   | `cd ../.. && pnpm install --frozen-lockfile`          |
| Build Command     | `cd ../.. && pnpm turbo run build --filter=@omni/web` |
| Production domain | `omniassist.kevinrozario.com`                                |

Set these for Production, Preview, and Development:

| Variable                                          | Production                          | Preview                                                               |
| ------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------- |
| `NEXT_PUBLIC_API_URL`                             | `https://api.omniassist.kevinrozario.com` | `https://api.omniassist.kevinrozario.com`                                   |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`               | Clerk production publishable key    | Clerk development publishable key, unless the preview uses production |
| `CLERK_SECRET_KEY`                                | Clerk production secret             | Matching Clerk secret                                                 |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL`                   | `/sign-in`                          | `/sign-in`                                                            |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL`                   | `/sign-up`                          | `/sign-up`                                                            |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` | `/`                                 | `/`                                                                   |
| `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` | `/`                                 | `/`                                                                   |

In the Clerk dashboard, allow `https://omniassist.kevinrozario.com` and the Vercel preview origins you actually use.

After the first production deployment, confirm a signed-out visit to `https://omniassist.kevinrozario.com` redirects to `/sign-in`.

Add origins to `deploy/api.env` and recreate the API container:

- `https://omniassist.kevinrozario.com`
- the production `*.vercel.app` origin, if visitors still use it
- each preview origin that should call the API, copied exactly from that deployment

A preview URL changes per branch. Paste the one you need. There is no wildcard entry.
