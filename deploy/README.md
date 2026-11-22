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
| `engine` | `network` | The pinned livepeer-builder engine (`lpb serve`) |
| `discovery` | `network` | The engine's discovery reader (`lpb discovery`) |
| `clearinghouse` | `network` | Clearinghouse Batteries, the payment provider |
| `signer` | `network` | The livepeer/node remote signer |

Without the `network` profile only the app starts, in mock-only mode or pointed at an engine you already run
(`ENGINE_URL`).

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
- Alerts need the long-running server this bundle starts: one watcher inside it asks the engine whether it
  is ready once a minute. An instance that is down sends nothing, so watch the instance itself from outside.
- `./livepeer doctor` says, for each platform, whether alerts are set up and what is wrong if they are half
  set. The web console's System page says the same, and whether Apple or Google last refused the credentials.

## Templates

- `templates/vps/` — a plain VPS: install script and a Caddy reverse proxy.
- `templates/fly/` — Fly.io, app only, pointed at an engine you run elsewhere.
