import "server-only";

import { ConfigError, validateConfig, type InstanceConfig } from "@livepeer/config";
import type { CapabilityStore } from "@livepeer/api-client";
import type { InstanceSettings } from "@livepeer/operator-console";

import { effectiveInstance, forgetInstance, type EffectiveInstance } from "../instance";
import { capabilityOf, settingsOf, withCapabilities, withSettings, type SavedCapability } from "../instance-overrides";
import { cleanLogo } from "./logo";
import { settingsStore } from "./settings-store";

/** A section of what the console saves: the Settings page's fields, or every capability's own settings. */
export type SettingsSection = "settings" | "capabilities";

/** Where the deployed config comes from, in words for the Settings page. */
function sourceOf(base: EffectiveInstance["base"]): string {
  return base.source === "file" ? (base.file ?? "the config file") : base.source === "environment" ? "the INSTANCE_CONFIG_JSON variable" : "the built-in preset";
}

export async function currentSettings(): Promise<{ settings: InstanceSettings; source: string; saved: boolean; ignored: boolean }> {
  const { config, base, saved, ignored } = await effectiveInstance();
  return { settings: settingsOf(config), source: sourceOf(base), saved: saved.settings, ignored: ignored.settings };
}

/** Whether capabilities have settings saved over the deployed config, and whether those are being left out. */
export async function capabilityOverrides(): Promise<{ source: string; saved: boolean; ignored: boolean }> {
  const { base, saved, ignored } = await effectiveInstance();
  return { source: sourceOf(base), saved: saved.capabilities, ignored: ignored.capabilities };
}

const problems = (error: unknown): string => (error instanceof ConfigError ? error.issues.map((issue) => `${issue.path || "config"} ${issue.message}`).join("; ") : "The settings couldn't be saved.");

/** Saves the Settings page's fields over the deployed config, once the config is valid with them. */
export async function saveSettings(settings: InstanceSettings): Promise<{ ok: true } | { ok: false; error: string }> {
  const symbol = cleanLogo(settings.logoSymbol);
  if (!symbol.ok) return { ok: false, error: `Symbol: ${symbol.error}` };
  const wordmark = cleanLogo(settings.logoWordmark);
  if (!wordmark.ok) return { ok: false, error: `Wordmark: ${wordmark.error}` };
  const cleaned: InstanceSettings = { ...settings, name: settings.name.trim(), domain: settings.domain.trim(), logoSymbol: symbol.value ?? "", logoWordmark: wordmark.value ?? "" };
  try {
    validateConfig(structuredClone(withSettings((await effectiveInstance()).base.config, cleaned)));
  } catch (error) {
    return { ok: false, error: problems(error) };
  }
  await settingsStore().saveSettings(cleaned);
  forgetInstance();
  return { ok: true };
}

/** Forgets what the console saved for a section: the config the instance was deployed with applies again. */
export async function resetSettings(section: SettingsSection): Promise<void> {
  await settingsStore().reset(section);
  forgetInstance();
}

/**
 * Each capability's settings, read from the config this request is being served from and saved over the
 * deployed one. A change applies in this process at once, and in every other within a few seconds.
 */
export function configCapabilityStore(config: InstanceConfig): CapabilityStore {
  let current = config;
  return {
    read: (app) => capabilityOf(current, app),
    async reset() {
      await resetSettings("capabilities");
      current = (await effectiveInstance()).config;
    },
    async write(app, patch) {
      if (patch.markup != null && !(patch.markup >= 1)) throw new Error("A markup can't be less than 1.");
      const next: SavedCapability = { ...capabilityOf(current, app), ...patch };
      let changed: InstanceConfig;
      try {
        changed = validateConfig(structuredClone(withCapabilities(current, { [app]: next })));
      } catch (error) {
        throw new Error(problems(error));
      }
      await settingsStore().saveCapability(app, capabilityOf(changed, app));
      forgetInstance();
      current = changed;
    },
  };
}
