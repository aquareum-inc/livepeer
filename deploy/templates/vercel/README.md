# Vercel

The instance's web app (user app, operator console, API and MCP) as a Vercel project, with its own state in a
managed Postgres such as Neon. Nothing is written to disk.

**Status: not yet deployed to a real Vercel project.** The build command, the migrations and a server with
only a Postgres and no disk were run locally against Postgres 17; the list under "Check on the first
deployment" is what only Vercel itself can show.

## What this gives you, and what it doesn't

Only the web app runs on Vercel. **The engine, the payment provider and the remote signer are long-running
services and never run there.** Run them elsewhere (the Compose bundle's `network` profile, `deploy/README.md`)
and point the app at the engine with `ENGINE_URL`, or set `MOCK_ONLY=1` for a look around with no engine.

What works as it does anywhere: everything the instance itself keeps, which is all in the database. Phone
sessions for users and operators, the operators' team, invitations and audit log, reports, blocks and
takedowns, alerts state, and what the console's Settings and Capabilities pages save.

What does not, until the functions behind it go live (`docs/data-sources.md` says which are mocked):

- **Mocked features are unreliable.** Generations and their progress, the library, conversations, characters
  you make, live sessions and calls, API keys, preferences, plans, credit and workspaces are mock data held
  in one process's memory. Vercel answers requests from several instances and stops idle ones, so a render
  started on one can be "not found" on the next poll, and a key or workspace you just made can vanish. It
  will often seem to work, because warm instances are reused. This is not fixed by the database and is not
  meant to be: that data belongs to the engine and the payment provider. For a hosted demo that behaves, use
  one long-running machine (`../fly/`, or the Compose bundle).
- **Uploads are capped at 4 MB.** Vercel refuses a request over 4.5 MB before the app sees it. Set
  `UPLOAD_LIMIT_MB=4` and the app refuses a larger file itself, saying what the limit is. Elsewhere the limits
  are 20 MB for a picture and 200 MB for a video. Sending files straight to object storage is a separate plan.
- **Alerts to operators' phones need something to call the instance every minute.** See "Alerts" below.
- **Live sessions and long jobs** are mocked today and will not pass through a Vercel function when they go
  live: a function can't hold a connection open, and is cut off at 300 seconds by default
  (`docs/engine-requests.md`, Q26 and Q27).

## Set up

1. **Fork the repository** and, in your fork, copy one of this folder's two files to `apps/web/vercel.json`
   and commit it:
   - `vercel.json` on the Pro plan or above. It has Vercel call the alerts round every minute.
   - `vercel.hobby.json` on the Hobby plan. It has no schedule: Hobby allows a cron once a day at most and
     refuses to deploy a project that asks for more.
2. **Import the fork as a Vercel project** with Root Directory `apps/web`. Leave "Include files outside the
   root directory in the Build Step" on (the default): the app is built from the whole workspace. The install
   and build commands come from `vercel.json`. Vercel picks pnpm 10 from `packageManager` in `package.json`;
   the first lines of the build log say which version ran, and `ENABLE_EXPERIMENTAL_COREPACK=1` pins it exactly.
3. **Add a Postgres database.** With Neon's integration from the Vercel Marketplace, the project gets
   `DATABASE_URL` (pooled, which requests use) and `DATABASE_URL_UNPOOLED` (direct, which migrations use)
   without your copying anything. **Turn on a database branch for Preview deployments** when you connect the
   database, or keep the two variables to the Production environment only. Otherwise every preview build
   migrates your production database. Any other Postgres works: set the two variables yourself, and leave
   the second empty if the address isn't pooled.
4. **Set the environment variables** below.
5. **Deploy.** The build runs `pnpm -w run db:migrate && pnpm run build`: it brings the database to this
   release's schema first, and a failed migration changes nothing and fails the build, so the previous
   deployment keeps serving. `https://<your-domain>/api/health` then answers `"database":"ok"`.
6. **Make yourself the first operator.** From a checkout, with the project's `SESSION_SECRET` in `.env`:
   `./livepeer invite-operator --url https://<your-domain>`. Open the link it prints and sign in.

## Environment variables

Each is described in `.env.example`.

| Variable | On Vercel |
| --- | --- |
| `SESSION_SECRET` | Required. `openssl rand -base64 32`. The same value in every environment that shares a database. |
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | Required. Set by the Neon integration. Without `DATABASE_URL` the build fails, and the app has no disk to keep a database of its own on. |
| `CRON_SECRET` | Set it on every plan: `openssl rand -hex 32`. Vercel Cron sends it to `/api/cron/alerts`, and it tells the app not to start its own timer, which a function can't keep running. Vercel reads it when it builds, so redeploy after changing it. |
| `UPLOAD_LIMIT_MB` | `4`. |
| `INSTANCE_CONFIG_JSON` | Your instance config as JSON on one line. There is no file to mount, so `INSTANCE_CONFIG` and `instance.config.json` are not read here. Empty: the built-in `full` preset. |
| `ENGINE_URL`, `ENGINE_READER_TOKEN`, `ENGINE_ADMIN_TOKEN` | The engine you run elsewhere. Or `MOCK_ONLY=1` and none of the three. |
| `OIDC_CLIENT_SECRET`, `OPERATOR_API_TOKEN`, `APNS_*`, `FCM_SERVICE_ACCOUNT` | As anywhere else, if you use them. |

Leave `DATA_DIR`, `POSTGRES_PASSWORD`, `APP_PORT` and the image variables unset: they belong to the Compose
bundle.

## Alerts

With `surfaces.mobileConsole` on, operators' phones are told when the engine isn't ready, jobs are failing or
a report is waiting. A round of checks each minute sends them, and on Vercel nothing runs between requests,
so something has to ask for each round.

- **Pro and above:** `vercel.json` has Vercel Cron call `GET /api/cron/alerts` every minute with
  `Authorization: Bearer $CRON_SECRET`. Crons run on the production deployment only. A call that fails isn't
  tried again; the next minute's does the work.
- **Hobby:** there is no schedule, so alerts are off unless you run one. Any scheduler that can make the same
  request each minute will do. A daily cron is no use: "not ready on two checks a minute apart" needs a
  check a minute.
- The route answers 404 to anyone without the secret. Calling it more often than a round is due does nothing.
- When no round has run for five minutes, `/api/health` reports `"alerts":"overdue"` and the console's
  System page says so under "Alert checks".

## Releases

Deploying a new commit migrates, then builds, then switches traffic. The deployment already serving keeps
running against the migrated database while the new one builds, so a release only ever adds to the schema;
removing something waits for the release after the code stopped using it.

## Check on the first deployment

These could not be tried without a Vercel project:

- The build finishes with `output: "standalone"` in `apps/web/next.config.ts`, which the Docker image needs.
  Vercel is expected to ignore it.
- Functions start with no `DATA_DIR`, no config file and no `.env` on disk. The app looks for those two
  directories above its working directory and carries on when it finds nothing, wherever that is.
- Idle database connections are closed before a function is suspended (`attachDatabasePool`): watch the
  database's connection count after a burst of requests.
- The cron's calls appear in the project's logs each minute and "Alert checks" on the System page reads
  "running".
