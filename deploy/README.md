# Self-hosting Stagecue

A single-host deployment using Docker Compose and the container image
published to GitHub Container Registry (GHCR).

## Prerequisites

- Docker 24+ with the `docker compose` plugin (v2).
- A host reachable by every audience device for the event (speaker
  laptops, door tablets, lobby displays). For offline events that's
  the same Wi-Fi LAN; for online events that's a public URL.

## Quick start

```bash
# Grab the compose file + env template.
curl -O https://raw.githubusercontent.com/expertslive/stagecue/main/deploy/docker-compose.yml
curl -o .env https://raw.githubusercontent.com/expertslive/stagecue/main/deploy/.env.example

# Edit .env — at minimum, set SA_PASSWORD and APP_BASE_URL.
$EDITOR .env

# Pull and start.
docker compose up -d
```

Then browse to whatever you put in `APP_BASE_URL`. The first request will
create an admin account (the app's first-run setup flow). After that, log
in and start configuring events and rooms.

## Environment variables

| Variable        | Required | Notes                                                                 |
|-----------------|----------|-----------------------------------------------------------------------|
| `SA_PASSWORD`   | yes      | SQL Server `sa` password. 8+ chars with upper, lower, digit, symbol.  |
| `APP_BASE_URL`  | yes      | URL the app advertises; QR codes link here. Use the host's LAN IP for offline events. |
| `STAGECUE_TAG`  | no       | Image tag to run. Defaults to `latest`.                               |
| `APP_PORT`      | no       | Host port to bind. Defaults to `8080`.                                |

## Updating

```bash
docker compose pull
docker compose up -d
```

By default this follows `:latest`, which is moved when a new release is
tagged. To freeze on a specific build, set `STAGECUE_TAG` in `.env`:

```bash
echo 'STAGECUE_TAG=v0.1.0' >> .env
docker compose pull && docker compose up -d
```

Browse available tags on the
[**stagecue package page**](https://github.com/expertslive/stagecue/pkgs/container/stagecue).

## Image tags reference

| Tag                | Built from                | Use when                                    |
|--------------------|---------------------------|---------------------------------------------|
| `latest`           | most recent release tag   | you want auto-updates within major versions |
| `v1.2.3`           | exactly that release      | you want a fully pinned, reproducible deploy |
| `1.2`, `1`         | the most recent v1.2.x / v1.x.x release | you want auto-updates within a minor / major |
| `edge`             | latest commit on `main`   | you're a tester and want pre-release builds |
| `sha-<short>`      | a specific commit         | bisecting / reproducing a bug               |

## Persistence

Two named Docker volumes are created on first run:

- `uploads` — branding assets, logos, anything uploaded through the UI.
- `sqldata` — the SQL Server database.

`docker compose down` keeps them; `docker compose down -v` wipes them.
Back them up with `docker run --rm -v stagecue_sqldata:/data -v "$PWD":/backup busybox tar czf /backup/sqldata.tar.gz /data` (adjust the
volume name for your project prefix).

## Troubleshooting

- **App container restarts in a loop with a SQL connection error.** Check
  `docker compose logs db` — SQL Server is fussy about passwords; if it
  rejects `SA_PASSWORD` for complexity the db service never becomes
  healthy. Pick a password with at least one upper, one lower, one
  digit, and one symbol, then `docker compose down -v` to wipe the
  half-initialised data volume and start again.
- **QR codes point to `localhost`.** You forgot to set `APP_BASE_URL`
  to the host's LAN IP (or public URL). Update `.env` and
  `docker compose up -d` — the change takes effect on the next
  container restart.
- **`docker compose pull` is slow.** Multi-arch images are ~400 MB
  before extraction; first pull on a fresh host takes a few minutes.
