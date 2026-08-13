# Creeper-Bot

- [Creeper Bot Roadmap](https://github.com/users/CreeperPlanet26/projects/2)
- Current package version: `4.0.18-BETA`

## Overview

Creeper-Bot is a Node.js + TypeScript Discord bot with:

- a Discord bot runtime
- an Express health endpoint on `/`
- Fortnite sprite browsing and image rendering
- Fortnite map and stats features

Production is currently intended to run in Docker through Coolify on an Oracle Cloud VPS.

## Local Development

### Requirements

- Node.js `22.x`
- npm

### Environment

Copy `.env.example` to `.env` and fill in the values you need:

- `BOT_TOKEN`
- `DEV_BOT_TOKEN`
- `MONGO_URI`

Optional variables are only required for features that use them:

- `FORTNITE_API_KEY`
- `FORTNITE_MAP_API_KEY`
- `SCRAPER_API_KEY`
- `TWITTER_BEARER_TOKEN`

Default runtime values in `.env.example`:

- `NODE_ENV=production`
- `HOST_TYPE=oracle`
- `PORT=3001`

For local development you can change these if needed.

### Run Locally

Install dependencies:

```bash
npm ci
```

Start in watch mode:

```bash
npm run dev
```

Build production output:

```bash
npm run build
```

Run the built bot:

```bash
npm run prod
```

## Health Endpoint

The bot exposes a simple health/version route from [src/index.ts](C:/Users/Sohan/Desktop/Creeper-Bot/src/index.ts:37):

```http
GET /
```

Response:

```json
{
  "serverStartedAt": "...",
  "version": "v4.0.18-BETA"
}
```

Inside the container, the app listens on port `3001`.

## Production Deployment

### Current Production Model

Production uses:

- Oracle Cloud VPS
- Coolify
- Docker Compose with host PID visibility
- Chromium installed in the container

The production image is defined in [Dockerfile](C:/Users/Sohan/Desktop/Creeper-Bot/Dockerfile).

Key runtime details:

- base image: `node:22-bookworm`
- system browser: `chromium`
- `PUPPETEER_SKIP_DOWNLOAD=true`
- app port: `3001`

### Coolify Setup

In Coolify:

1. Create a Git-based application from this repository.
2. Use the `Docker Compose` build pack.
3. Set the Compose file location to `/docker-compose.yml`.
4. Set the branch you want to deploy.
5. Configure environment variables from `.env.example` plus your real secrets.
6. Assign the application domain to the `creeper-bot` service on port `3001`.
7. Deploy.

The Compose service uses `pid: host` so `c!cpu` can inspect the server-wide process table rather than only processes inside the bot container. It also uses `init: true` to reap Chromium child processes. This intentionally reduces process isolation, but does not enable privileged mode, host networking, direct host port publishing, or Docker socket access.

Coolify's **Custom Docker Options** field does not support `--pid=host`; use the Compose build pack for this deployment.

Important runtime env values for production:

```env
NODE_ENV=production
HOST_TYPE=oracle
PORT=3001
HOST=0.0.0.0
GOOGLE_CHROME_BIN=/usr/bin/chromium
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
PUPPETEER_SKIP_DOWNLOAD=true
```

### Public URLs

Typical split:

- Coolify dashboard: `http://<server-ip>:8000/login`
- App/API: routed through Coolify proxy on `80/443`

If the app is configured with a Coolify hostname, the app may respond on a host like:

```text
http://<app-subdomain>.<server-ip>.sslip.io
```

The bare IP on port `80` will only work if the Coolify route is configured to match that host.

## Oracle Networking

To expose the app publicly through Coolify, Oracle ingress rules should allow:

- `TCP 80` from `0.0.0.0/0`
- `TCP 443` from `0.0.0.0/0`

If you want direct public access to the Coolify dashboard by IP, also allow:

- `TCP 8000`

Recommended security posture:

- leave `80` and `443` public
- restrict `8000` to your IP if possible

The VM itself must also allow the same ports.

## Logs And Management

### Coolify

Primary production logs should be viewed from Coolify:

- application logs
- deployment logs
- container restart status

### VPS

Useful commands on the server:

Show running containers:

```bash
sudo docker ps
```

Show app logs:

```bash
sudo docker logs -f <container-name>
```

Check the direct app response from inside the VPS:

```bash
curl -i -H 'Host: <coolify-app-hostname>' http://127.0.0.1/
```

## Fortnite Sprite Cache Behavior

The Fortnite sprite renderer keeps rendered images in an in-memory cache in [src/Fortnite/FortniteSprites/FortniteSprites.ts](C:/Users/Sohan/Desktop/Creeper-Bot/src/Fortnite/FortniteSprites/FortniteSprites.ts:142).

Current behavior:

- cached rendered sprite images are stored in memory for the running process
- cached raw sprite assets may be stored under `.cache/fortnite-sprites/assets`
- render cache keys include a Fortnite sprite UI fingerprint

That means Fortnite sprite UI/cache invalidation now happens automatically when sprite UI render inputs change, such as:

- sprite render code
- `tokens.css`
- sprite UI icon assets

The cache is not invalidated just because the overall app version changes.

## Persisting `.cache` In Coolify

If you want the app-level `.cache` directory to survive redeploys, add a Coolify directory mount:

- source: `/data/coolify/applications/<app-id>/creeper-cache`
- destination: `/app/.cache`

For this bot, that mainly affects locally cached sprite assets.

## Repository Notes

This repository no longer uses the older direct-to-Oracle GitHub Actions deploy flow.

Removed/deprecated approach:

- Oracle `systemd` service deployment
- GitHub Actions-based Oracle branch deploy scripts

The current intended deployment path is Coolify.
