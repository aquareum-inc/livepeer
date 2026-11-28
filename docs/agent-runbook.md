# Self-hosting with an agent: runbook

For a coding agent walking a person through putting their own instance online. `AGENTS.md` is the
reference for each command (flags, output, exit codes). This is the order to do things in, who does each
step, how to tell it worked, and where people get stuck.

## How to use this

- Do the steps marked **Agent** yourself. Stop at each step marked **Person**, say exactly what you need
  and why, and wait.
- These always stay with the person. Never do them, even if asked: creating accounts, accepting terms,
  paying or adding a subscription, and typing or pasting a secret. Give them the page or the command.
- Never print a secret, and never ask for one in chat. Secrets go from the person straight into `.env` on
  the server, or into the host's own settings page.
- After every stage run the check it names. Don't go on until it passes.
- Don't run paid jobs against a live engine without the person saying so.
- Start in mock-only mode. It needs no keys and no money, and the person sees the product working within
  minutes. Add real sign-in, then the real network, one at a time.

## Choose a path

| | A. One server (recommended) | B. Vercel and managed services |
| --- | --- | --- |
| What runs where | Everything on one Linux server, from this repository's Compose bundle | The web app on Vercel, Postgres on Neon, files in an S3 bucket, the engine on a server anyway |
| Accounts the person needs | A server provider, a domain, an identity provider | Vercel, Neon, a storage provider, a domain, an identity provider, and a server provider once the engine is real |
| Steps only the person can do | About five | About a dozen |
| Choose it when | They want it running with the least to manage. This is the default | They already run on Vercel, or want no server for the web app |

If the person has no preference, use path A.

## What every public instance needs

Ask for these before starting, so nothing stalls halfway.

| Need | Why | Who |
| --- | --- | --- |
| A domain or subdomain they can point at the instance | HTTPS, and sign-in's return address | Person |
| An OpenID Connect identity provider, with a client for this instance | Real sign-in. The built-in test sign-in lets anyone in as the test operator, so it must never face the internet | Person creates the client. PymtHouse is the planned default; any OIDC provider works |
| For the real network only: a funded Ethereum keystore, its password and an Arbitrum One RPC address | The signer pays for compute | Person. Skip in mock-only mode |

The identity provider's client needs one setting: an allowed redirect address of
`https://<domain>/auth/callback`. From it you need the issuer address and the client id (not secret), and
the person keeps the client secret for step A5.

## Path A: one server

### A1. A server (Person)

Ask for a Debian or Ubuntu server with 2 vCPUs and 4 GB of memory, a public address, and SSH access for
you. Ports 22, 80 and 443 open and nothing else. Have them turn on the provider's backups.

Before the real network (A9), have them read the provider's acceptable-use policy for wording about
cryptocurrency: the signer holds a funded key, and some providers forbid that.

Check: `ssh <server> 'uname -a && nproc && free -g'`.

### A2. Point the domain at it (Person)

An `A` record for the domain, to the server's address. Check: `dig +short <domain>` prints that address.
It can take a few minutes.

### A3. Install what the bundle needs (Agent)

On the server, as root. These are the installs `deploy/templates/vps/install.sh` makes. Don't run that
script itself yet: it also publishes the instance, which must wait for A5.

```bash
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh
command -v node >/dev/null || { curl -fsSL https://deb.nodesource.com/setup_22.x | sh && apt-get install -y nodejs; }
command -v caddy >/dev/null || apt-get install -y caddy
```

Then clone this repository on the server (the address you got this file from) and work from its root.

Check: `docker compose version && node --version` (Node 22 or later).

### A4. Start it privately, in mock-only mode (Agent)

```bash
./livepeer setup --preset full --json
./livepeer doctor --json
```

The first run builds the image and takes a few minutes. `setup` prints one JSON line with `"ok":true`;
`doctor` exits 0. The app listens on the server's loopback address only, so nothing is public yet.

Let the person look at it through a tunnel from their own machine, then open `http://localhost:3000`:

```bash
ssh -L 3000:127.0.0.1:3000 <server>
```

Every sign-in method there signs in as a test user. Tell them this is a preview on mock data.

### A5. Real sign-in (Person, then Agent)

1. **Person:** create the identity provider's client with redirect address
   `https://<domain>/auth/callback`, and give you the issuer and client id.
2. **Agent:** in `instance.config.json` set the domain and sign-in:

   ```json
   "domain": "<domain>",
   "auth": { "provider": "oidc", "oidc": { "issuer": "<issuer>", "clientId": "<client id>" }, "signUp": "open" }
   ```

   Use `"signUp": "closed"` if only the team should get in for now. Add `"methods": [...]` with only the
   methods the provider's own login page offers.
3. **Person:** on the server, open `.env` in an editor and paste the client secret after
   `OIDC_CLIENT_SECRET=`, on that one line, with no quotes, spaces or line break after it.
4. **Agent:** `./livepeer setup --json`, which restarts the app with the new config.

Check: `curl -s -o /dev/null -w '%{redirect_url}\n' 'http://127.0.0.1:3000/auth/start?method=email'`
prints an address at the identity provider, not at the instance.

### A6. Publish it (Agent)

```bash
sed "s/{\$DOMAIN}/<domain>/" deploy/templates/vps/Caddyfile > /etc/caddy/Caddyfile && systemctl reload caddy
```

Caddy gets the HTTPS certificate itself. Check: `curl -fsS https://<domain>/api/health` answers
`"status":"ok"`, and its `"owner"` is `"none"`.

### A7. The first owner (Person)

Have the person open `https://<domain>/operator` and sign in. While the instance has no owner and no
`ENGINE_ADMIN_TOKEN`, it shows "Set up <name>" with one button, "Become the owner". Do this straight
after A6: the offer goes to whoever opens that page first.

If the page is a 404 (the admin token is already set, or someone got there first):

```bash
./livepeer invite-operator --url https://<domain> --json
```

Give the person the `url` from its output. It works once, for 72 hours. If a stranger claimed the
instance, the person removes them on the console's Team page afterwards.

Check: `/api/health` reports `"owner":"set"`. If sign-in ends on "Sign-in didn't complete", read the
app's log for a line starting `[auth] sign-in failed:` (`docker logs livepeer-app-1 2>&1 | grep '\[auth\]'`).
`invalid_client` means the client secret in `.env` doesn't match the provider's.

### A8. Hand over (Agent)

Run `./livepeer doctor --json` once more and tell the person, in plain words:

- the address, and that they are the owner;
- that it is in mock-only mode: generations, the library and credit are sample data until the real network
  is connected (`docs/data-sources.md` lists what is mocked);
- how to add teammates (Team in the console), and how to upgrade (`git pull && ./livepeer upgrade --json`);
- what to back up: the database (`docker compose -f deploy/compose.yaml --env-file .env exec -T db pg_dump
  -U livepeer livepeer > backup.sql`), the `storage-data` volume, and `.env`. A restored database is
  unreadable without the same `SESSION_SECRET`.

### A9. The real network (Person decides; do not start it unasked)

This connects the instance to the Livepeer network through the bundle's own engine, payment provider and
signer, and from then on jobs cost real money.

- It needs the keystore, its password, the RPC address and the engine's settings described under "Running
  the network profile" in `deploy/README.md`. The person places those files; you never read the keystore.
- Then `./livepeer setup --network --json`, and `./livepeer doctor --json` until the engine, reader token,
  admin token and provider rows pass.
- **This profile has not been run from this repository**, because it needs a funded key. Expect to debug
  the first start, and tell the person so before they fund anything.
- Make sure A7 is done first: the setup page closes once `ENGINE_ADMIN_TOKEN` is set.

## Path B: Vercel and managed services

`deploy/templates/vercel/README.md` is the reference. The order that works:

| # | Step | Who |
| --- | --- | --- |
| B1 | Import the repository as a Vercel project. Choose **Import single project** for `apps/web` (Vercel offers a multi-service setup because of the Dockerfile; decline it). Root Directory `apps/web` | Person creates the account and team; Agent can drive the import |
| B2 | Build command `pnpm -w run db:migrate && pnpm run build`, install command `pnpm install --frozen-lockfile`, or copy the template's `vercel.json` to `apps/web/vercel.json` | Agent |
| B3 | Add Neon from the project's Storage tab. Turn on a database branch for **Preview**. Turn Neon's own **Auth** off | Person accepts Neon's terms; Agent sets the options |
| B4 | Secrets in the project's environment variables: `SESSION_SECRET`, `CRON_SECRET`, `OIDC_CLIENT_SECRET` | Person |
| B5 | `MOCK_ONLY=1`, and `INSTANCE_CONFIG_JSON` with the config on one line (sign-in as in A5), for Production | Agent |
| B6 | A private S3 bucket with the CORS rule from `deploy/README.md` for the instance's address, and a token limited to that bucket. `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT` for Production | Person creates the account, subscription and token and pastes its two keys; Agent does the rest |
| B7 | Deploy. `/api/health` reports `"database":"ok"` and `"storage":{"kind":"s3","status":"ok"}` | Agent |
| B8 | The first owner, as in A7 | Person |

The engine, payment provider and signer never run on Vercel. For the real network they go on a server
(A9), and `ENGINE_URL` and the two engine tokens go in Vercel's environment variables.

## Where people get stuck

- **A secret copied with a line break.** `openssl rand … | pbcopy` copies a trailing newline, and the app
  uses the value as stored. Generate secrets with `openssl rand -base64 32 | tr -d '\n' | pbcopy`.
- **The test sign-in on a public address.** In mock-only mode with `auth.provider` left as `mock`, anyone
  can sign in as the test operator. Never publish an instance before A5. This is also why
  `deploy/templates/vps/install.sh` is not used as written above.
- **Preview deployments migrating production (Vercel).** Without a database branch for Preview, every
  preview build runs migrations against the production database.
- **Variables changed, nothing happened (Vercel).** Variables are read when a deployment is built.
  Redeploy after changing any.
- **Sign-in comes back to "didn't complete".** Read the `[auth] sign-in failed:` line in the server's log
  (Vercel: the project's Logs). It names the step and the provider's error code.
- **`/operator` is a 404 for the person who deployed.** They aren't an operator yet. See A7.
- **Dashboards that ask to verify identity or accept new terms.** Hand those to the person and wait.
- **Uploads refused on a host with no disk.** `/api/health` says `"storage":{"status":"unavailable"}`
  until the `S3_*` values are set.
