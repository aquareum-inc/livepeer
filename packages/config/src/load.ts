import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { InstanceConfig } from "./generated";
import { preset } from "./presets";
import { ConfigError, validateConfig } from "./validate";

export const DEFAULT_CONFIG_FILE = "instance.config.json";

export interface LoadOptions {
  /** Directory relative paths resolve against. */
  cwd?: string;
  env?: Record<string, string | undefined>;
}

export interface LoadedConfig {
  config: InstanceConfig;
  /** Absolute path of the file read, or null when the config came from the environment or the "full" preset. */
  file: string | null;
  /** Where the config came from. */
  source: "file" | "environment" | "preset";
}

/**
 * Reads the instance config: INSTANCE_CONFIG_JSON (the config itself, for hosts with no file to mount) if
 * set, else the file INSTANCE_CONFIG names, else ./instance.config.json, else the "full" preset. ENGINE_URL
 * overrides `engine.url`.
 */
export function loadConfig(options: LoadOptions = {}): LoadedConfig {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const explicit = env.INSTANCE_CONFIG;
  const file = path.resolve(cwd, explicit || DEFAULT_CONFIG_FILE);

  let config: InstanceConfig;
  let source: string | null = file;
  if (env.INSTANCE_CONFIG_JSON) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(env.INSTANCE_CONFIG_JSON);
    } catch (error) {
      throw new ConfigError([{ path: "", message: `INSTANCE_CONFIG_JSON is not valid JSON (${(error as Error).message})` }]);
    }
    config = validateConfig(parsed);
    source = null;
  } else if (existsSync(/* turbopackIgnore: true */ file)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(/* turbopackIgnore: true */ file, "utf8"));
    } catch (error) {
      throw new ConfigError([{ path: "", message: `is not valid JSON (${(error as Error).message})` }]);
    }
    config = validateConfig(parsed);
  } else if (explicit) {
    throw new ConfigError([{ path: "", message: `file not found: ${file}` }]);
  } else {
    config = preset("full");
    source = null;
  }

  if (env.ENGINE_URL) config.engine = { ...config.engine, url: env.ENGINE_URL };
  if (env.CLEARINGHOUSE_URL) config.engine = { ...config.engine, clearinghouseUrl: env.CLEARINGHOUSE_URL };
  return { config, file: source, source: source ? "file" : env.INSTANCE_CONFIG_JSON ? "environment" : "preset" };
}
