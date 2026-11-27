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

## File storage

Files people upload (pictures up to 20 MB, videos up to 200 MB) go straight from the browser or phone to
object storage with a short-lived signed address, and are read back the same way. The app's server never
receives them, and the storage key never leaves it. `docs/media-storage.md` has the design.

Storage is anything that speaks the S3 API. Set these in `.env`:

| Variable | Cloudflare R2 | AWS S3 | Backblaze B2 |
|----------|---------------|--------|--------------|
| `S3_BUCKET` | your bucket | your bucket | your bucket |
| `S3_ENDPOINT` | `https://<account id>.r2.cloudflarestorage.com` | leave empty | `https://s3.<region>.backblazeb2.com` |
| `S3_REGION` | `auto` | the bucket's region | the bucket's region |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | an API token for that bucket: object read and write | an IAM user allowed `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject` on the bucket's objects and `s3:ListBucket` on the bucket | an application key for that bucket |

Keep the bucket private: the app signs every address it hands out. Browsers send files from your site's
address, so the bucket has to allow it (phones don't need this). The rule, as each provider's CORS setting
takes it:

```json
[{ "AllowedOrigins": ["https://your-instance.example"], "AllowedMethods": ["PUT", "GET"], "AllowedHeaders": ["content-type"], "MaxAgeSeconds": 3600 }]
```

If the app's server reaches storage at a different address than your users do (a storage server on a private
network, published under a media domain), put the users' address in `S3_PUBLIC_ENDPOINT`. A proxy in front
of storage must pass the `Host` header through unchanged, since the signature covers it.

With no `S3_BUCKET`, files are kept on the app's own disk in `DATA_DIR` (the `app-data` volume here). That
is right for development and for one machine with a volume, and can't work on a host with no disk.
`./livepeer doctor` and `/api/health` say which is in use and whether it can be reached. Uploads that were
started and never finished are removed within the hour by the same round of checks that sends alerts.

Back up the bucket with your provider's own tools, alongside the database: the database holds the record of
each file, the bucket the file.

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
  so don't set it here. `./livepeer doctor` and the System page say when nothing has run the checks for five
  minutes. An instance that is down sends nothing, so watch the instance itself from outside.
- `./livepeer doctor` says, for each platform, whether alerts are set up and what is wrong if they are half
  set. The web console's System page says the same, and whether Apple or Google last refused the credentials.

## Templates

- `templates/vps/` — a plain VPS: install script and a Caddy reverse proxy.
- `templates/fly/` — Fly.io, app only, pointed at an engine you run elsewhere.
