import "server-only";

import { statSync } from "node:fs";
import path from "node:path";

import { DEFAULT_CONFIG_FILE, loadConfig, validateConfig, type InstanceConfig, type LoadedConfig } from "@livepeer/config";
import type { Brand } from "@livepeer/ui";

import { env } from "./env";
import { readSettings, settingsOf, withCapabilities, withSettings } from "./instance-overrides";
import { settingsStore } from "./operator/settings-store";

/** How long one process trusts what it last read. A change saved elsewhere applies within this long. */
export const TRUSTED_MS = 10_000;

/** The config the instance runs on, and how it came to be that. */
export interface EffectiveInstance {
  /** The deployed config with what the console saved laid over it. */
  config: InstanceConfig;
  /** The config the instance was deployed with: a file, INSTANCE_CONFIG_JSON or the built-in preset. */
  base: LoadedConfig;
  /** Which sections the console has saved something for. */
  saved: { settings: boolean; capabilities: boolean };
  /** Saved changes that no longer make a valid config and are being left out, by section. */
  ignored: { settings: boolean; capabilities: boolean };
}

const root = () => path.join(/* turbopackIgnore: true */ process.cwd(), "../..");

/** What decides the deployed config: the variables that name it and when its file last changed. */
function baseKey(): string {
  let changed = 0;
  try {
    changed = statSync(/* turbopackIgnore: true */ path.resolve(/* turbopackIgnore: true */ root(), env("INSTANCE_CONFIG") || DEFAULT_CONFIG_FILE)).mtimeMs;
  } catch {
    // No file: the instance runs from INSTANCE_CONFIG_JSON or the built-in preset.
  }
  return JSON.stringify([changed, env("INSTANCE_CONFIG"), env("INSTANCE_CONFIG_JSON"), env("ENGINE_URL"), env("DATA_DIR"), env("DATABASE_URL")]);
}

const valid = (config: InstanceConfig): InstanceConfig | null => {
  try {
    return validateConfig(structuredClone(config));
  } catch {
    return null;
  }
};

async function read(): Promise<EffectiveInstance> {
  const base = loadConfig({ cwd: root(), env: { INSTANCE_CONFIG: env("INSTANCE_CONFIG"), INSTANCE_CONFIG_JSON: env("INSTANCE_CONFIG_JSON"), ENGINE_URL: env("ENGINE_URL") } });
  // While the app is being built there is no database to ask, and the few pages rendered then (the "not
  // found" page) carry the deployed config's name. Everything served afterwards reads what the console saved.
  const overrides = process.env.NEXT_PHASE === "phase-production-build" ? { settings: null, capabilities: {} } : await settingsStore().read();
  const saved = { settings: overrides.settings !== null, capabilities: Object.keys(overrides.capabilities).length > 0 };

  // Each layer is kept only if the config is still valid with it. A saved change the schema has since moved
  // away from is left out and the page says so; it can never take the instance down.
  const settled = saved.settings ? valid(withSettings(base.config, readSettings(overrides.settings, settingsOf(base.config)))) : null;
  const afterSettings = settled ?? base.config;
  const placed = saved.capabilities ? valid(withCapabilities(afterSettings, overrides.capabilities)) : null;
  return { config: placed ?? afterSettings, base, saved, ignored: { settings: saved.settings && !settled, capabilities: saved.capabilities && !placed } };
}

let held: { key: string; at: number; value: EffectiveInstance } | null = null;
let reading: { key: string; work: Promise<EffectiveInstance> } | null = null;

/**
 * The instance's config and where it came from. One process reads it at most every few seconds: a request
 * asks for it many times, and on a host with a database each read is a query. If the database can't be
 * asked, the last answer stands; with no last answer the request fails, since serving the deployed config
 * alone could switch back on what an operator switched off.
 */
export async function effectiveInstance(): Promise<EffectiveInstance> {
  const key = baseKey();
  if (held?.key === key && Date.now() - held.at < TRUSTED_MS) return held.value;
  if (reading?.key !== key) {
    const work = read()
      .then((value) => {
        held = { key, at: Date.now(), value };
        return value;
      })
      .catch((error: unknown) => {
        if (held?.key === key) return held.value;
        throw error;
      })
      .finally(() => {
        if (reading?.work === work) reading = null;
      });
    reading = { key, work };
  }
  return reading.work;
}

/** The instance config: what it was deployed with, and what the console has changed since. */
export async function instance(): Promise<InstanceConfig> {
  return (await effectiveInstance()).config;
}

/** Drops what this process holds, so its next read sees a change it has just saved. */
export function forgetInstance(): void {
  held = null;
  reading = null;
}

/** The instance's name and marks, as the shells and sign-in draw them. */
export function brandOf(config: InstanceConfig): Brand {
  return { name: config.name, symbol: config.logo?.symbol, wordmark: config.logo?.wordmark, tint: config.logo?.tint ?? true };
}
