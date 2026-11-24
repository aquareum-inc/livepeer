#!/usr/bin/env node
/**
 * livepeer setup | doctor | upgrade
 *
 * Non-interactive, safe to run twice, JSON on request. Exit codes:
 *   0 ok · 1 doctor found problems · 2 bad usage · 3 invalid config · 4 Docker unavailable
 *   5 the bundle failed to start · 6 the health check did not pass
 */
import { spawnSync } from "node:child_process";
import { createPrivateKey, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";


const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const CONFIG_PKG = path.join(ROOT, "packages/config");
const EXIT = { ok: 0, problems: 1, usage: 2, config: 3, docker: 4, start: 5, health: 6 };
const PRESETS = ["full", "headless"];

const USAGE = `livepeer <command> [options]

Commands
  setup     Write .env and instance.config.json, then start the bundle
  doctor    Check config, keys, engine and provider; say what to fix
  upgrade   Move the app and its pinned engine to this checkout's release, then restart

Options
  --preset <full|headless>   Preset to start from (setup; default: full)
  --config <file>            Use this instance config instead of a preset (setup)
  --mock-only                Run without engine keys; every function is mocked (setup)
  --network                  Also start the engine, payment provider and signer (setup, upgrade)
  --no-start                 Write files but don't start containers (setup)
  --port <n>                 Port for the app (setup; default: 3000)
  --dir <path>               Instance directory (default: the repository root)
  --json                     Machine-readable output
  -h, --help                 Show this help`;

function fail(code, message, json) {
  if (json) process.stdout.write(`${JSON.stringify({ ok: false, error: message, exitCode: code })}\n`);
  else process.stderr.write(`error: ${message}\n`);
  process.exit(code);
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

/**
 * Validates a config against the schema. A fresh checkout has no node_modules, so when the
 * schema validator isn't installed this falls back to checking the required shape; the app
 * validates in full when it starts, and `doctor` reports what it finds.
 */
async function validate(config) {
  const schema = readJson(path.join(CONFIG_PKG, "schema/instance.schema.json"));
  let Ajv;
  try {
    ({ Ajv } = await import("ajv"));
  } catch {
    const issues = [];
    if (typeof config !== "object" || config === null || Array.isArray(config)) return ["/ must be an object"];
    if (typeof config.name !== "string" || config.name === "") issues.push("/name must be a non-empty string");
    const surfaces = config.surfaces;
    if (typeof surfaces !== "object" || surfaces === null) issues.push("/surfaces is required");
    else for (const key of schema.properties.surfaces.required) if (typeof surfaces[key] !== "boolean") issues.push(`/surfaces/${key} must be true or false`);
    for (const key of Object.keys(config)) if (!(key in schema.properties)) issues.push(`/ must NOT have additional properties ("${key}")`);
    return issues;
  }
  const ajv = new Ajv({ allErrors: true, strict: false, formats: { uri: true } });
  const check = ajv.compile(schema);
  if (check(config)) return [];
  return (check.errors ?? []).map((error) => `${error.instancePath || "/"} ${error.message}`);
}

function parseEnv(text) {
  const values = {};
  for (const line of text.split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return values;
}

/** Sets keys in an env file's text, keeping comments, order and any value already set. */
function mergeEnv(text, updates, { overwrite = [] } = {}) {
  const lines = text === "" ? [] : text.replace(/\n$/, "").split("\n");
  const seen = new Set();
  const changed = [];
  const next = lines.map((line) => {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match || !(match[1] in updates)) return line;
    const key = match[1];
    seen.add(key);
    if (match[2] !== "" && !overwrite.includes(key)) return line;
    if (match[2] === updates[key]) return line;
    changed.push(key);
    return `${key}=${updates[key]}`;
  });
  for (const [key, value] of Object.entries(updates)) {
    if (seen.has(key)) continue;
    next.push(`${key}=${value}`);
    changed.push(key);
  }
  return { text: `${next.join("\n")}\n`, changed };
}

function release() {
  const config = readJson(path.join(ROOT, "release.config.json"));
  return {
    REGISTRY: config.registry,
    ORG: config.org,
    APP_VERSION: config.version,
    ENGINE_REPO: config.engine.repo,
    ENGINE_REF: config.engine.ref,
    PROVIDER_REPO: config.provider.repo,
    PROVIDER_REF: config.provider.ref,
    SIGNER_REF: config.signer.ref,
  };
}

function compose(dir, args, { network = false, capture = false } = {}) {
  const base = ["compose", "-f", path.join(ROOT, "deploy/compose.yaml"), "--env-file", path.join(dir, ".env")];
  if (network) base.push("--profile", "network");
  return spawnSync("docker", [...base, ...args], {
    cwd: dir,
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
    env: { ...process.env, INSTANCE_DIR: dir },
  });
}

function dockerAvailable() {
  return spawnSync("docker", ["compose", "version"], { stdio: "ignore" }).status === 0;
}

async function waitForHealth(url, seconds) {
  const deadline = Date.now() + seconds * 1000;
  let last = "no response";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (response.ok) return { ok: true, body: await response.json() };
      last = `HTTP ${response.status}`;
    } catch (error) {
      last = error.cause?.code ?? error.message;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  return { ok: false, detail: last };
}

/** What the bundle's one-shot migrate service last reported: {applied, total}, or null when it said nothing. */
function migrations(dir) {
  const logs = compose(dir, ["logs", "--no-log-prefix", "migrate"], { capture: true });
  const line = (logs.stdout ?? "").trim().split("\n").findLast((entry) => entry.startsWith("{"));
  try {
    return line ? JSON.parse(line) : null;
  } catch {
    return null;
  }
}

/** Why `up` failed, in one line. A failed migration is the one cause worth naming: the app won't start on it. */
function startFailure(dir, up) {
  const states = compose(dir, ["ps", "--all", "--format", "json", "migrate"], { capture: true });
  if (/"ExitCode":\s*[1-9]/.test(states.stdout ?? "")) {
    const logs = compose(dir, ["logs", "--no-log-prefix", "--tail", "1", "migrate"], { capture: true });
    return `the database migration failed, so the app was not started${logs.stdout?.trim() ? ` (${logs.stdout.trim()})` : ""}`;
  }
  return `docker compose up failed${up.stderr ? `: ${up.stderr.trim().split("\n").pop()}` : ""}`;
}

async function setup(options) {
  const { json } = options;
  const dir = path.resolve(options.dir ?? ROOT);
  const say = (message) => json || process.stdout.write(`${message}\n`);

  if (options.preset && options.config) fail(EXIT.usage, "use --preset or --config, not both", json);
  const presetName = options.preset ?? "full";
  if (!options.config && !PRESETS.includes(presetName)) {
    fail(EXIT.usage, `unknown preset "${presetName}" (expected ${PRESETS.join(" or ")})`, json);
  }

  // 1. Instance config: keep an existing file; otherwise write the preset or the given file.
  const configFile = path.join(dir, "instance.config.json");
  let configAction = "kept";
  let config;
  if (options.config) {
    const source = path.resolve(options.config);
    if (!existsSync(source)) fail(EXIT.config, `config file not found: ${source}`, json);
    config = readJson(source);
    configAction = existsSync(configFile) ? "replaced" : "written";
  } else if (existsSync(configFile)) {
    config = readJson(configFile);
  } else {
    const { $schema: _schema, ...preset } = readJson(path.join(CONFIG_PKG, "presets", `${presetName}.json`));
    config = preset;
    configAction = "written";
  }
  const issues = await validate(config);
  if (issues.length > 0) fail(EXIT.config, `instance config is invalid:\n  ${issues.join("\n  ")}`, json);
  if (configAction !== "kept") writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`);
  say(`instance.config.json ${configAction}`);

  // 2. .env: generate what can be generated, never overwrite a value that is already set.
  const envFile = path.join(dir, ".env");
  const template = existsSync(envFile) ? readFileSync(envFile, "utf8") : readFileSync(path.join(ROOT, ".env.example"), "utf8");
  const current = parseEnv(template);
  const haveEngine = Boolean(current.ENGINE_URL);
  const mockOnly = options["mock-only"] || (!haveEngine && !options.network);
  const updates = {
    ...release(),
    SESSION_SECRET: randomBytes(32).toString("base64url"),
    // For the bundle's own Postgres. It goes into a connection address, so it must be safe in a URL.
    POSTGRES_PASSWORD: randomBytes(24).toString("base64url"),
    APP_PORT: String(options.port || current.APP_PORT || 3000),
    MOCK_ONLY: mockOnly ? "1" : "",
  };
  if (options.network && !haveEngine) updates.ENGINE_URL = "http://engine:8080";
  const pins = Object.keys(release());
  const merged = mergeEnv(template, updates, { overwrite: [...pins, "MOCK_ONLY", ...(options.port ? ["APP_PORT"] : [])] });
  writeFileSync(envFile, merged.text, { mode: 0o600 });
  say(`.env ${merged.changed.length > 0 ? `updated (${merged.changed.join(", ")})` : "unchanged"}`);
  if (mockOnly) say("mode: mock-only (no engine keys needed; add ENGINE_URL and tokens to .env, then run setup again)");

  const port = parseEnv(merged.text).APP_PORT;
  const result = { ok: true, dir, preset: options.config ? null : presetName, config: configAction, env: merged.changed, mode: mockOnly ? "mock-only" : "live", url: `http://localhost:${port}`, started: false };

  // 3. Start the bundle and wait for the health check.
  if (!options["no-start"]) {
    if (!dockerAvailable()) fail(EXIT.docker, "Docker with the Compose plugin is required. Install Docker, or pass --no-start.", json);
    const up = compose(dir, ["up", "-d", "--build"], { network: options.network, capture: json });
    if (up.status !== 0) fail(EXIT.start, startFailure(dir, up), json);
    result.migrations = migrations(dir);
    if (result.migrations) say(`database migrated (migrations applied: ${result.migrations.applied})`);
    const health = await waitForHealth(`${result.url}/api/health`, 120);
    if (!health.ok) fail(EXIT.health, `the app did not become healthy at ${result.url}/api/health (${health.detail}). Run: livepeer doctor`, json);
    result.started = true;
    result.health = health.body;
    say(`ready at ${result.url}`);
  }
  if (json) process.stdout.write(`${JSON.stringify(result)}\n`);
}

async function probe(url, headers = {}) {
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
    return { status: response.status, body: await response.json().catch(() => null) };
  } catch (error) {
    return { status: 0, error: error.cause?.code ?? error.message };
  }
}

/** A variable that holds a whole file as base64 on one line, read back as text. Null when it isn't that. */
function fileFromBase64(value) {
  if (!/^[A-Za-z0-9+/=_-]+$/.test(value)) return null;
  const text = Buffer.from(value, "base64").toString("utf8");
  return text.includes("\uFFFD") || text.trim() === "" ? null : text;
}

function privateKey(pem) {
  try {
    return createPrivateKey(pem);
  } catch {
    return null;
  }
}

/**
 * Whether the instance can send alerts to operators' iPhones: the same reading as apps/web/lib/push. Alerts
 * are optional, so no credentials at all is fine; half-set or unreadable ones are not. Never prints a value.
 */
function alertsToIphone(env, config) {
  const [key, keyId, teamId] = [env.APNS_KEY, env.APNS_KEY_ID, env.APNS_TEAM_ID];
  if (!key && !keyId && !teamId) return { ok: true, detail: "not set up (optional)" };
  const missing = [!key && "APNS_KEY", !keyId && "APNS_KEY_ID", !teamId && "APNS_TEAM_ID"].filter(Boolean);
  if (missing.length > 0) return { ok: false, detail: `${missing.join(" and ")} missing` };
  if (!/^[A-Z0-9]{10}$/.test(keyId)) return { ok: false, detail: "APNS_KEY_ID isn't a 10-character key id" };
  if (!/^[A-Z0-9]{10}$/.test(teamId)) return { ok: false, detail: "APNS_TEAM_ID isn't a 10-character team id" };
  const pem = fileFromBase64(key);
  const parsed = pem ? privateKey(pem) : null;
  if (!parsed) return { ok: false, detail: "APNS_KEY isn't the .p8 file as base64" };
  if (parsed.asymmetricKeyType !== "ec" || parsed.asymmetricKeyDetails?.namedCurve !== "prime256v1") return { ok: false, detail: "APNS_KEY isn't an APNs authentication key (P-256)" };
  if (!config?.mobile?.ios?.bundleId) return { ok: false, detail: "an APNs key is set but mobile.ios.bundleId is not" };
  return { ok: true, detail: `key ${keyId} for ${config.mobile.ios.bundleId}` };
}

/** The same for Android phones: the Firebase service account, and the project's public values in the config. */
function alertsToAndroid(env, config) {
  if (!env.FCM_SERVICE_ACCOUNT) return { ok: true, detail: "not set up (optional)" };
  const text = fileFromBase64(env.FCM_SERVICE_ACCOUNT);
  let account = null;
  try {
    account = text ? JSON.parse(text) : null;
  } catch {
    account = null;
  }
  if (!account || account.type !== "service_account" || typeof account.project_id !== "string" || typeof account.client_email !== "string" || typeof account.private_key !== "string") {
    return { ok: false, detail: "FCM_SERVICE_ACCOUNT isn't a service account's JSON file as base64" };
  }
  if (privateKey(account.private_key)?.asymmetricKeyType !== "rsa") return { ok: false, detail: "FCM_SERVICE_ACCOUNT's key isn't an RSA private key" };
  const firebase = config?.mobile?.android?.firebase;
  if (!firebase) return { ok: false, detail: "a service account is set but mobile.android.firebase is not" };
  if (firebase.projectId !== account.project_id) return { ok: false, detail: `the service account is for ${account.project_id}, the config names ${firebase.projectId}` };
  return { ok: true, detail: `project ${firebase.projectId}` };
}

async function doctor(options) {
  const dir = path.resolve(options.dir ?? ROOT);
  const checks = [];
  const add = (name, ok, detail, fix) => checks.push({ name, ok, detail, ...(ok || !fix ? {} : { fix }) });

  // Config
  const configFile = path.join(dir, "instance.config.json");
  let config = null;
  if (!existsSync(configFile)) {
    add("config", false, "instance.config.json not found", "Run: livepeer setup --preset full --no-start");
  } else {
    try {
      config = readJson(configFile);
      const issues = await validate(config);
      add("config", issues.length === 0, issues.length === 0 ? "valid" : issues.join("; "), `Fix the listed fields in ${configFile} (schema: packages/config/schema/instance.schema.json)`);
    } catch (error) {
      add("config", false, `not valid JSON: ${error.message}`, `Fix the syntax in ${configFile}`);
    }
  }

  // The console on phones signs operators in through an app named in the config, and only works beside the web console that manages its phones.
  if (config?.surfaces?.mobileConsole === true) {
    const named = Boolean(config.mobile?.ios?.bundleId || config.mobile?.android?.applicationId);
    const web = config.surfaces.console === true;
    add("console on phones", named && web, named && web ? "on; operators' phones are listed and revoked on the web console's System page" : !named ? "surfaces.mobileConsole is on but no phone app is named" : "surfaces.mobileConsole is on but the web console is off, so phones couldn't be revoked", !named ? `Set mobile.ios.bundleId or mobile.android.applicationId in ${configFile}, or set surfaces.mobileConsole to false` : `Set surfaces.console to true in ${configFile}, or set surfaces.mobileConsole to false`);
  }

  // Keys
  const envFile = path.join(dir, ".env");
  const env = { ...(existsSync(envFile) ? parseEnv(readFileSync(envFile, "utf8")) : {}), ...process.env };
  const mockOnly = env.MOCK_ONLY === "1" || env.MOCK_ONLY === "true";
  add("env file", existsSync(envFile), existsSync(envFile) ? ".env present" : ".env not found", "Run: livepeer setup --no-start");
  add("SESSION_SECRET", (env.SESSION_SECRET ?? "").length >= 32, (env.SESSION_SECRET ?? "") ? "set" : "missing", "Run: livepeer setup --no-start (generates one), or set a 32+ character value in .env");
  add("database address", Boolean(env.DATABASE_URL || env.POSTGRES_PASSWORD), env.DATABASE_URL ? "DATABASE_URL set" : env.POSTGRES_PASSWORD ? "the bundle's own Postgres" : "neither DATABASE_URL nor POSTGRES_PASSWORD is set", "Run: livepeer setup --no-start (generates POSTGRES_PASSWORD for the bundle's Postgres), or set DATABASE_URL in .env");
  // Alerts to operators' phones go straight to Apple and Google with the publisher's own credentials.
  if (config?.surfaces?.mobileConsole === true) {
    const iphone = mockOnly ? { ok: true, detail: "recorded, not sent (mock-only mode)" } : alertsToIphone(env, config);
    const android = mockOnly ? { ok: true, detail: "recorded, not sent (mock-only mode)" } : alertsToAndroid(env, config);
    add("alerts to iPhone", iphone.ok, iphone.detail, "Set APNS_KEY (the .p8 file as base64 on one line: base64 -i AuthKey_XXXXXXXXXX.p8), APNS_KEY_ID and APNS_TEAM_ID in .env, and mobile.ios.bundleId in the config");
    add("alerts to Android", android.ok, android.detail, "Set FCM_SERVICE_ACCOUNT (the service account's JSON as base64 on one line) in .env, and mobile.android.firebase in the config from the same Firebase project");
  }
  if (mockOnly) {
    add("engine keys", true, "not needed in mock-only mode");
  } else {
    for (const key of ["ENGINE_URL", "ENGINE_READER_TOKEN", "ENGINE_ADMIN_TOKEN"]) {
      add(key, Boolean(env[key]), env[key] ? "set" : "missing", `Set ${key} in .env, or set MOCK_ONLY=1 to run without the engine`);
    }
  }

  // Engine and provider
  if (mockOnly) {
    add("engine", true, "skipped (mock-only mode)");
    add("provider", true, "skipped (mock-only mode)");
  } else if (env.ENGINE_URL) {
    const ready = await probe(new URL("/readyz", env.ENGINE_URL));
    const version = ready.body?.version ? ` (version ${ready.body.version})` : "";
    add("engine", ready.status === 200, ready.status === 200 ? `reachable${version}` : `not ready: ${ready.error ?? `HTTP ${ready.status}`}`, `Check that the engine is running at ${env.ENGINE_URL}. With the bundle: livepeer setup --network`);
    if (ready.status === 200 && env.ENGINE_READER_TOKEN) {
      const jobs = await probe(new URL("/v1/jobs?limit=1", env.ENGINE_URL), { authorization: `Bearer ${env.ENGINE_READER_TOKEN}` });
      add("reader token", jobs.status === 200, jobs.status === 200 ? "accepted" : `refused (HTTP ${jobs.status})`, "ENGINE_READER_TOKEN must be an auditor key issued by the engine");
    }
    if (ready.status === 200 && env.ENGINE_ADMIN_TOKEN) {
      const keys = await probe(new URL("/v1/admin/keys", env.ENGINE_URL), { authorization: `Bearer ${env.ENGINE_ADMIN_TOKEN}` });
      add("admin token", keys.status === 200, keys.status === 200 ? "accepted" : `refused (HTTP ${keys.status})`, "ENGINE_ADMIN_TOKEN must be an admin key. An actor (builder) key gets 403 here.");
      const grants = keys.status === 200 ? await probe(new URL("/v1/admin/grants", env.ENGINE_URL), { authorization: `Bearer ${env.ENGINE_ADMIN_TOKEN}` }) : { status: 0 };
      add("provider", grants.status === 200, grants.status === 200 ? "reachable through the engine" : "not verified (needs a working admin token)", "Fix the admin token first; then check the payment provider container is healthy");
    }
  }

  // App
  const appUrl = `http://localhost:${env.APP_PORT || 3000}/api/health`;
  const app = await probe(appUrl);
  // The app answers 503 when it is up but something it needs is not; its body says what.
  const answered = typeof app.body?.status === "string";
  add("app", app.status === 200, app.status === 200 ? `healthy (${app.body?.mode})` : answered ? `running but ${app.body.status}` : `not reachable at ${appUrl}`, answered ? "Fix the failing checks listed here, then run doctor again" : "Run: livepeer setup");

  // Database: asked through the app, which is the only thing that can reach the bundle's Postgres.
  if (answered) {
    const database = app.body.database;
    add("database", database !== "unreachable", database === "unreachable" ? "not reachable from the app" : database === "none" ? "none: state is kept in files (development and tests only)" : "reachable", env.DATABASE_URL ? "Check DATABASE_URL in .env and that the database accepts connections from the app" : "Check the bundle's Postgres: docker compose -f deploy/compose.yaml ps db");
    if (database === "ok" || database === "behind") {
      add("database schema", database === "ok", database === "ok" ? "has every migration this release expects" : "behind this release's migrations", "Run: livepeer upgrade (it applies the pending migrations before the app starts)");
    }
    // Operators' alerts are sent by a round of checks each minute. With nothing running it, they are told nothing.
    if (app.body.alerts === "overdue") {
      add("alert checks", false, "nothing has run them in the last five minutes", env.CRON_SECRET ? "CRON_SECRET is set, so a scheduler has to call /api/cron/alerts every minute with it as a bearer token. Unset it on a host whose server stays running, and the server runs them itself" : "Check the app container's logs: its own timer should run them each minute");
    } else if (app.body.alerts === "running" || app.body.alerts === "starting") {
      add("alert checks", true, app.body.alerts);
    }
  }

  const ok = checks.every((check) => check.ok);
  if (options.json) {
    process.stdout.write(`${JSON.stringify({ ok, checks })}\n`);
  } else {
    for (const check of checks) {
      process.stdout.write(`${check.ok ? "ok  " : "FAIL"}  ${check.name.padEnd(16)} ${check.detail}\n`);
      if (check.fix) process.stdout.write(`      fix: ${check.fix}\n`);
    }
    process.stdout.write(ok ? "\nEverything checks out.\n" : "\nSome checks failed. Apply the fixes above and run doctor again.\n");
  }
  process.exit(ok ? EXIT.ok : EXIT.problems);
}

async function upgrade(options) {
  const { json } = options;
  const dir = path.resolve(options.dir ?? ROOT);
  const envFile = path.join(dir, ".env");
  if (!existsSync(envFile)) fail(EXIT.usage, "no .env here. Run: livepeer setup", json);
  const pins = release();
  // An instance set up before the bundle had its own Postgres has no password for it yet; one already set is kept.
  const merged = mergeEnv(readFileSync(envFile, "utf8"), { ...pins, POSTGRES_PASSWORD: randomBytes(24).toString("base64url") }, { overwrite: Object.keys(pins) });
  writeFileSync(envFile, merged.text, { mode: 0o600 });
  if (!dockerAvailable()) fail(EXIT.docker, "Docker with the Compose plugin is required.", json);
  const up = compose(dir, ["up", "-d", "--build"], { network: options.network, capture: json });
  if (up.status !== 0) fail(EXIT.start, startFailure(dir, up), json);
  const migrated = migrations(dir);
  const url = `http://localhost:${parseEnv(merged.text).APP_PORT || 3000}`;
  const health = await waitForHealth(`${url}/api/health`, 120);
  if (!health.ok) fail(EXIT.health, `the app did not become healthy (${health.detail}). Run: livepeer doctor`, json);
  if (json) process.stdout.write(`${JSON.stringify({ ok: true, version: pins.APP_VERSION, engine: pins.ENGINE_REF, changed: merged.changed, migrations: migrated })}\n`);
  else process.stdout.write(`upgraded to ${pins.APP_VERSION} (engine ${pins.ENGINE_REF.slice(0, 7)}); migrations applied: ${migrated?.applied ?? "unknown"}; ready at ${url}\n`);
}

let parsed;
try {
  parsed = parseArgs({
    allowPositionals: true,
    options: {
      preset: { type: "string" },
      config: { type: "string" },
      dir: { type: "string" },
      port: { type: "string" },
      "mock-only": { type: "boolean", default: false },
      network: { type: "boolean", default: false },
      "no-start": { type: "boolean", default: false },
      json: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
} catch (error) {
  fail(EXIT.usage, error.message, process.argv.includes("--json"));
}

const [command] = parsed.positionals;
const commands = { setup, doctor, upgrade };
if (parsed.values.help || !command) {
  process.stdout.write(`${USAGE}\n`);
  process.exit(command || parsed.values.help ? EXIT.ok : EXIT.usage);
}
if (!(command in commands)) fail(EXIT.usage, `unknown command "${command}". Run: livepeer --help`, parsed.values.json);
await commands[command](parsed.values);
