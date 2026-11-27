# Deploy

`compose.yaml` is both the local development setup and the standard way to self-host. `./livepeer setup`
drives it; you can also run Compose directly:

```bash
INSTANCE_DIR=$PWD docker compose -f deploy/compose.yaml --env-file .env up -d
```

## Services

| Service | Profile | What it is |
|---------|---------|------------|
| `app` | always | This repository: user app, operator console, API, MCP |
| `db` | always | Postgres 17, the instance's own database. No published port |
| `migrate` | always | The app image, run once on every `up`: applies pending migrations, then exits |
| `engine` | `network` | The pinned livepeer-builder engine (`lpb serve`) |
| `discovery` | `network` | The engine's discovery reader (`lpb discovery`) |
| `clearinghouse` | `network` | Clearinghouse Batteries, the payment provider |
| `signer` | `network` | The livepeer/node remote signer |

Without the `network` profile only the app and its database start, in mock-only mode or pointed at an engine
you already run (`ENGINE_URL`).

## Database

The bundle runs its own Postgres, with its data in the `db-data` volume and a password `./livepeer setup`
generates (`POSTGRES_PASSWORD`). The `migrate` service brings it to the release's schema before the app
starts, on `setup`, on `upgrade` and on a plain `docker compose up`. If a migration fails nothing is changed,
the app is not started, and `setup` and `upgrade` say so. `./livepeer doctor` and `/api/health` report
whether the database is reachable and whether its schema is the one this release expects.

Everything the instance keeps is in the database: users' and operators' phone sessions, the operators' audit
log, reports, blocks and takedowns of shared characters, what alerts have noticed and said, and what the
console's Settings and Capabilities pages change. The console never writes `instance.config.json`, which
stays mounted read-only: what it saves is laid over that file, and "Reset to deployed config" goes back to
it. The `app-data` volume is no longer written to.

Names and emails are never stored in the clear: where one has to be kept it is encrypted with
`SESSION_SECRET`. Keep that secret with your backups, or a restored database shows people by their ids only
and every phone signs in again.

Back up and restore:

```bash
docker compose -f deploy/compose.yaml --env-file .env exec -T db pg_dump -U livepeer livepeer > backup.sql
docker compose -f deploy/compose.yaml --env-file .env exec -T db psql -U livepeer livepeer < backup.sql
```

To use a Postgres you already run, set `DATABASE_URL` in `.env`: the app and `migrate` use it instead. If it
is a pooled address, also set `DATABASE_URL_UNPOOLED` to the direct one, which migrations need. The bundled
`db` still starts and sits idle; to leave it out, add an override file with `-f` after `compose.yaml`:

```yaml
services:
  db: !reset null
  migrate:
    depends_on: !reset []
```

## Running the network profile

The network services pay for compute on Arbitrum One, so they need keys this repository cannot generate:

1. `deploy/secrets/keystore.json` and `deploy/secrets/keystore-password`: an Ethereum keystore with a
   funded TicketBroker deposit and reserve.
2. `deploy/secrets/rpc-url`: an Arbitrum One RPC URL.
3. `deploy/network.env`: the engine's `LPB_*` settings (engine id, allocation mode, Batteries tokens,
   secret key). The reference for these is builder-core-console's `deploy/.env.example`.

Then:

```bash
./livepeer setup --network
```

Versions are pinned in `release.config.json` and copied into `.env` by `setup` and `upgrade`. The engine
and Clearinghouse Batteries don't publish images yet, so Compose builds them from the pinned Git commits on
first run. The files in `deploy/config/` come from builder-core-console's stack.

**Status:** the `app` service is tested end to end in both presets. The `network` profile is modelled on
builder-core-console's stack and has not been run here, because it needs a funded key.

## Alerts to operators' phones (optional)

With `surfaces.mobileConsole` on, an operator's phone can be told when the engine isn't ready, jobs are failing
or a report is waiting (`docs/mobile/plan.md` §18.9). The instance sends these itself, straight to Apple and
Google, with credentials from the developer accounts that publish your app. There is no relay, and without
credentials the console on phones works as before and says alerts aren't set up.

- **iPhone.** In your Apple Developer account, give the app's identifier the Push Notifications capability and
  create an APNs authentication key. Put it in `.env` as `APNS_KEY` (the `.p8` file as base64 on one line:
  `base64 -i AuthKey_XXXXXXXXXX.p8`), with `APNS_KEY_ID` and `APNS_TEAM_ID`. The app is the one named in
  `mobile.ios.bundleId`.
- **Android.** Create a Firebase project and register the app under `mobile.android.applicationId`. Put the
  project's public values in the config as `mobile.android.firebase` (`projectId`, `appId`, `apiKey`,
  `senderId`), and a service account that may send messages and nothing else in `.env` as
  `FCM_SERVICE_ACCOUNT` (its JSON file as base64 on one line).
- The server must be able to reach `api.push.apple.com`, `api.sandbox.push.apple.com` (development builds),
  `fcm.googleapis.com` and `oauth2.googleapis.com` on port 443.
- Alerts are sent by a round of checks each minute. This bundle's server runs them itself, with a timer, and
  there is nothing more to set up. On a host with no server between requests (Vercel), set `CRON_SECRET` and
  have a scheduler call `/api/cron/alerts` each minute with it as a bearer token; that also stops the timer,
  so don't set it here. `templates/vercel/` has the schedule for Vercel Cron, which runs each minute on the
  Pro plan and at most daily on Hobby. `./livepeer doctor` and the System page say when nothing has run the checks for five
  minutes. An instance that is down sends nothing, so watch the instance itself from outside.
- `./livepeer doctor` says, for each platform, whether alerts are set up and what is wrong if they are half
  set. The web console's System page says the same, and whether Apple or Google last refused the credentials.

## Templates

- `templates/vps/` — a plain VPS: install script and a Caddy reverse proxy.
- `templates/fly/` — Fly.io, app only, pointed at an engine you run elsewhere.
- `templates/vercel/` — Vercel, app only, with a managed Postgres such as Neon. Read its README first.

## Where each part can run

The app can go wherever a Next.js server or the Docker image runs. The engine, the payment provider and the
remote signer are long-running services with their own state and keys: they run in this bundle's `network`
profile or on machines of your own, never on a serverless host. An app deployed apart from them reaches the
engine through `ENGINE_URL`.

A serverless host (Vercel) keeps no server between requests and no disk, and that costs three things today:

| | Compose, a VPS, Fly | Vercel |
|---|---|---|
| The instance's own state (sessions, team, reports, settings, alerts state) | In Postgres | In Postgres, the same |
| Features still on mock data (generations, library, conversations, characters, API keys, plans, credit, workspaces: `docs/data-sources.md`) | Work, and are lost on restart | Unreliable: the data is in one process's memory and requests land on several. Not fixed until each goes live |
| Uploads | 20 MB pictures, 200 MB videos | 4 MB (`UPLOAD_LIMIT_MB=4`); Vercel refuses a request over 4.5 MB |
| Alerts to operators' phones | The server's own timer | A scheduler calling `/api/cron/alerts` each minute: Vercel Cron on the Pro plan, or one of your own on Hobby |
| Engine, payment provider, signer | The `network` profile | Elsewhere, always |
