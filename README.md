# Creeper-Bot

- [Creeper Bot Roadmap](https://github.com/users/CreeperPlanet26/projects/2)
- Current package version: `4.0.40`

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
- `FORTNITE_SPRITE_ARCHIVE_DIR` (persistent directory for sprite history/archives)
- `FORTNITE_SPRITE_HISTORY_PATH` (optional explicit history file path)
- `FORTNITE_SPRITE_STORAGE_NAMESPACE` (required in Coolify production; use `production` for the main app, and use a distinct stable value for other deployments)
- `FORTNITE_SPRITE_LEGACY_SEASON_ID` (one-time label for an existing pre-history `spriteData.json`)
- `FORTNITE_SPRITE_ARCHIVE_BACKUP_DIR` (optional Linux filesystem backup path)
- `FORTNITE_SPRITE_ARCHIVE_BACKUP_REQUIRED` (fail rollover when a configured backup is unavailable)
- `FORTNITE_SPRITE_ARCHIVE_B2_KEY_ID`, `FORTNITE_SPRITE_ARCHIVE_B2_APPLICATION_KEY`, and `FORTNITE_SPRITE_ARCHIVE_B2_BUCKET` (optional Linux Backblaze B2 Native API backup)
- `FORTNITE_SPRITE_ARCHIVE_B2_BUCKET_ID` (optional; avoids a bucket lookup for restricted keys)
- `FORTNITE_SPRITE_ARCHIVE_B2_PREFIX` (optional object prefix)
- `FORTNITE_SPRITE_ARCHIVE_B2_API_URL` (optional Native API override)
- `FORTNITE_SPRITE_ARCHIVE_ASSET_CONCURRENCY` (optional bootstrap download concurrency)
- `TWITTER_BEARER_TOKEN`

Default runtime values in `.env.example`:

- `NODE_ENV=production`
- `HOST_TYPE=oracle`
- `PORT=3001`

For local development you can change these if needed.

Sprite ingestion mirrors Fortnite.GG's own Season filter (`data-season`) and
excludes cards marked by its Show unreleased flag. Historical seasons remain in
the persistent sprite history and per-season archives rather than being mixed
into the current bot dataset.

When a refresh detects a different season, the bot first freezes the previous
current-season snapshot into an immutable per-season archive. The archive keeps
the exact raw catalog, a local catalog that points to frozen artwork, and a
checksum manifest. It uses the persisted artwork cache first and only falls
back to Fortnite.GG when an image was not already cached. If archiving fails,
the new season is not installed, preventing the old snapshot from being lost.
This protection depends on keeping `/app/.cache` on persistent storage in
production.

The runtime and `npm run fetch-sprites` use the same fetch → archive → history →
current-data workflow. The CLI no longer replaces the current catalog directly
when a new season is detected. On Linux, each verified archive can be copied to
the VPS filesystem path and/or Backblaze B2. Both copies include the manifest,
raw catalog, local catalog, and frozen artwork assets. B2 uses the Native API,
so it can authenticate with a master application key, although a bucket-scoped
standard key is safer for production. A configured backup failure stops the
season rollover, so the local archive remains available for a retry. Set
`FORTNITE_SPRITE_ARCHIVE_BACKUP_REQUIRED=true` to fail a rollover when a
configured provider is missing, unreachable, or the archive is missing artwork.

The B2 object layout is `<prefix>/<storage-namespace>/<season-slug>/...`, with
the mutable history index at
`<prefix>/<storage-namespace>/spriteHistory.json`. The manifest is uploaded
last, and retries verify the existing object sizes and SHA-1 checksums before
leaving an archive untouched. A different archive at the same season path is
rejected rather than overwritten. The B2 copy includes images; it is not just
metadata. This namespace prevents different branches with different scrape
days from sharing a bucket path.

For B2, set `FORTNITE_SPRITE_ARCHIVE_B2_KEY_ID` to the master application key ID
(formerly called the account ID) or a standard application key ID,
`FORTNITE_SPRITE_ARCHIVE_B2_APPLICATION_KEY` to its secret, and
`FORTNITE_SPRITE_ARCHIVE_B2_BUCKET` to an existing bucket name. If the key is
restricted and cannot list buckets, also set the bucket ID. The Native API
discovers the correct regional storage endpoint after authorization, so no S3
endpoint or region setting is needed.

The Docker Compose configuration bind-mounts the VPS directory
`/var/lib/creeper-bot/fortnite-sprite-archives` to
`/app/.backup/fortnite-sprites` in the container. Change the host path with
`FORTNITE_SPRITE_ARCHIVE_BACKUP_HOST_DIR` in Coolify/Compose if needed. The
directory must already be writable by the container user. Archives are stored
under a branch/deployment namespace below that container path. Without this bind
mount, Docker can write to the container's filesystem, but that copy will be
lost when Coolify replaces the container. The diagnostics payload reports the
container-side backup target and namespace.

To seed an already-existing persistent archive or retry every season in the
mounted directory, run `npm run backup-sprite-archives` inside the production
container. The backup command is intentionally a no-op outside Linux.

### Migrate Existing Sprite Archives to the VPS Copy

The bind mount is a new second location; it does not automatically copy data
from the existing `creeper-bot-cache` volume. After setting the Compose host
path, migrate the archives while the new container is running:

1. Create the host directory on the Docker VPS if it does not exist:

   ```bash
   sudo mkdir -p /var/lib/creeper-bot/fortnite-sprite-archives
   ```

2. Redeploy the Compose application so the directory is mounted at
   `/app/.backup/fortnite-sprites` (with the active storage namespace below it).

3. Run the migration command inside the production container:

   ```bash
   npm run backup-sprite-archives
   ```

   With the default production paths, this reads existing archives from
   `/app/.cache/fortnite-sprites/<storage-namespace>/archives` and copies them
   to the mounted VPS directory under the same namespace. In Coolify, open the
   application/container terminal and run the
   command there. If using Docker directly, the equivalent is:

   ```bash
   docker compose exec creeper-bot npm run backup-sprite-archives
   ```

4. Verify that each migrated season has a manifest on the VPS:

   ```bash
   find /var/lib/creeper-bot/fortnite-sprite-archives -maxdepth 2 -name manifest.json -print
   ```

The migration is safe to repeat. It verifies the source and destination
archives, leaves an existing valid archive untouched, and refuses to overwrite
an archive with a different checksum. The host directory must be writable by
the container user. If the VPS uses a different host path, replace the path in
these commands and set `FORTNITE_SPRITE_ARCHIVE_BACKUP_HOST_DIR` to the same
path before redeploying.

### Seed Existing Sprite Archives into Backblaze B2

After setting the B2 variables, run the same migration command from the
production container:

```bash
npm run backup-sprite-archives
```

It scans the local archive root and uploads every season to the configured B2
prefix. The command is safe to repeat: complete archives are checksum-checked
and skipped, while a different archive at an existing season path is rejected.
If an older local tree contains multiple genuinely different snapshots for the
same season, the migration preserves the additional snapshots under a
checksum-suffixed immutable key instead of overwriting one.
Keep `FORTNITE_SPRITE_ARCHIVE_BACKUP_REQUIRED=true` for production so a B2
failure prevents a new season from replacing the only current snapshot.

### Seed the Currently Installed Season

The normal rollover archive is intentionally created only when a new season is
confirmed: that is the point at which the previous catalog is known to be
finished. If you want an off-site copy of the season already installed in a
running container, use the one-time bootstrap command:

```bash
npm run archive-current-sprites
```

On Linux production it reads the persistent current catalog from
`/app/.cache/fortnite-sprites/<storage-namespace>/spriteData.json`, reuses the binary artwork cache
when possible, fetches any missing artwork from Fortnite.GG, verifies every
asset, and uploads the complete archive through the configured backup provider.
The default destination is a content-specific key such as
`chapter-7-season-4-bootstrap-<fingerprint>`. That suffix is deliberate: a
bootstrap snapshot must not block the canonical `chapter-7-season-4` archive
that will be created later from the true end-of-season catalog. The command is
safe to repeat for the same catalog and preserves a new key if the catalog
content changes.

The command is Linux-only. Override `FORTNITE_SPRITE_DATA_PATH` or
`FORTNITE_SPRITE_ASSET_CACHE_DIR` only when the container uses non-default
paths. This seeds the currently installed season; it cannot reconstruct an
older season that was never saved as a full catalog archive.

### Run Locally

For normal local development, especially on Windows, set `NODE_ENV=development`
in `.env` and use `DEV_BOT_TOKEN`. Leave the Linux-only sprite backup variables
blank. Local ignored sprite state is automatically namespaced by the checked-out
Git branch; set `FORTNITE_SPRITE_STORAGE_NAMESPACE` only when you need a custom
stable name. The bot disables production render-disk caching, automatic season
archiving, filesystem backups, and Backblaze B2 backups outside Linux, and it
falls back to the checked-in sprite data when local cache/archive paths do not
exist.

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

The bot exposes a simple health/version route from [src/index.ts](src/index.ts:37):

```http
GET /
```

Response:

```json
{
  "serverStartedAt": "...",
  "version": "v4.0.40"
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

The production image is defined in [Dockerfile](Dockerfile).

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
6. For the production app, explicitly set `FORTNITE_SPRITE_STORAGE_NAMESPACE=production`.
   Keep this value stable across redeploys. Use a different value such as `staging`
   for another branch or deployment so sprite history, archives, cache, and B2
   objects cannot mix.
7. Assign the application domain to the `creeper-bot` service on port `3001`.
8. Deploy.

The Compose service uses `pid: host` so `c!cpu` can inspect the server-wide process table rather than only processes inside the bot container. It also uses `init: true` to reap Chromium child processes. This intentionally reduces process isolation, but does not enable privileged mode, host networking, direct host port publishing, or Docker socket access.

Coolify's **Custom Docker Options** field does not support `--pid=host`; use the Compose build pack for this deployment.

Important runtime env values for production:

```env
NODE_ENV=production
FORTNITE_SPRITE_STORAGE_NAMESPACE=production
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

The Fortnite sprite renderer keeps rendered images in memory everywhere, but only
Linux production writes the rendered PNG cache to disk. The production cache is
implemented in [src/Fortnite/FortniteSprites/FortniteSprites.ts](src/Fortnite/FortniteSprites/FortniteSprites.ts:142).

This behavior is independent of Coolify, Docker, Oracle, or any other hosting
provider: any Linux process with `NODE_ENV=production` enables it. A persistent
`.cache` mount is optional; without one, the bot safely rebuilds the cache after
each restart.

Current behavior:

- local and development environments render on demand and do not use the file cache
- Linux production starts the finite pre-render queue after startup on every build
- Linux production persists the last current-season catalog under `.cache/fortnite-sprites/<storage-namespace>/spriteData.json`
- a season change creates an immutable archive under `.cache/fortnite-sprites/<storage-namespace>/archives/<season-id>` before replacing that catalog
- the queue uses one paced background render worker so interactive renders remain responsive
- the original login/status message keeps its login text and receives an attached embed updated every 30 seconds with rendered, remaining, failed, elapsed, and ETA values
- rendered PNGs are stored under `.cache/fortnite-sprites/<storage-namespace>/renders`
- raw downloaded sprite assets are stored as binary `.bin` files under `.cache/fortnite-sprites/<storage-namespace>/assets` only in Linux production; the manifest remains JSON metadata
- each production asset namespace includes a manifest with the downloaded image hash and any Fortnite.GG `ETag`/`Last-Modified` validators
- cache keys include the render schema, app version, render source/UI inputs, and the effective sprite catalog (including history-derived season availability)
- render telemetry is appended as daily JSONL files under `.cache/fortnite-sprites/<storage-namespace>/telemetry` and is never automatically deleted
- generation telemetry records start, 30-second progress, completion, cancellation, and failure events with elapsed time, screens per second, task durations, bytes rendered, and the current screen

That means cache invalidation happens automatically when relevant inputs change, such as:

- sprite render code
- `tokens.css`
- sprite UI icon assets
- a new app build/version
- updated Fortnite.GG sprite data or history
- changed sprite artwork at an unchanged Fortnite.GG image URL

Production revalidates the artwork during its startup and runtime refresh passes. It
uses conditional HTTP requests when Fortnite.GG supplies validators, hashes any
downloaded image bytes, and invalidates the current rendered-image namespace when
the artwork hash changes. This means a URL-only cache hit cannot permanently hide a
changed sprite image.

When fresh data is found, active tracked messages first show `Sprite fetch in progress`.
The most recently interacted page is refreshed first, followed by the remaining stale
messages, and the background pre-render queue resumes afterward. Message state is
kept in memory only; an interaction with an older message can reconstruct its view
from the controls and request the current cached/on-demand image without a state JSON file.

## Persisting `.cache` In Coolify

The Compose file declares a named `creeper-bot-cache` volume mounted at
`/app/.cache` and a separate `creeper-bot-telemetry` volume mounted at
`/app/.telemetry`. Coolify reuses both volumes across production container
replacements.

If host-directory bind mounts are preferred, configure them in Coolify at the
same container destinations (`/app/.cache` and `/app/.telemetry`) instead of
using the named volumes; do not configure both for either path.

For this bot, the cache mount preserves downloaded sprite assets and rendered
PNGs, while the telemetry mount preserves JSONL diagnostics independently. The
cache volume may be cleared when troubleshooting without deleting telemetry.
A new UI/data fingerprint automatically selects a new cache namespace, and
completed generations prune obsolete rendered namespaces while leaving telemetry
intact.

Each telemetry line is one JSON event containing the timestamp, app/build identity,
event type, initiating Discord username, interacting Discord username, message ID,
request ID, cache outcome, hashed cache/asset key, duration, page-queue wait,
rendered pixels, Chromium RSS, and any failure message. Generation events also
persist progress and speed metrics, so a Discord embed edit is not the only record
of how long a pre-render run took. Asset sync events also record whether Fortnite.GG
data changed and how many assets succeeded or failed.
The initial command writes a message-binding event after Discord assigns the actual
message ID; subsequent interaction and refresh events include that message ID
directly. Telemetry is production-only and remains in its dedicated Docker volume
until manually removed. To clear disposable cache without touching telemetry,
remove only the `creeper-bot-cache` volume; do not remove
`creeper-bot-telemetry`.

## Repository Notes

This repository no longer uses the older direct-to-Oracle GitHub Actions deploy flow.

Removed/deprecated approach:

- Oracle `systemd` service deployment
- GitHub Actions-based Oracle branch deploy scripts

The current intended deployment path is Coolify.
