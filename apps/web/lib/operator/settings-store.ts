import "server-only";

import { eq, schema, type Database } from "@livepeer/db";

import { storeOver } from "../data/database";
import type { SavedCapability } from "../instance-overrides";

/** What the console has saved over the config the instance was deployed with. */
export interface SavedOverrides {
  /** The Settings page's fields as last saved, or null while the config's own apply. */
  settings: unknown | null;
  capabilities: Record<string, SavedCapability>;
}

/** Where the console's changes are kept. The config itself is never written. */
export interface SettingsStore {
  read(): Promise<SavedOverrides>;
  saveSettings(settings: unknown): Promise<void>;
  /** A capability's settings in full. Two operators changing different capabilities don't undo each other. */
  saveCapability(app: string, saved: SavedCapability): Promise<void>;
  /** Forgets what was saved for one section, so the config the instance was deployed with applies again. */
  reset(section: "settings" | "capabilities"): Promise<void>;
}

const { instanceSettings, capabilitySettings } = schema;
/** The one row of `instance_settings`. */
const ONLY = "instance";

/** The console's changes in Postgres: one row for the Settings page, and a row per capability. */
export function postgresSettingsStore(db: Database): SettingsStore {
  return {
    async read() {
      const [[saved], capabilities] = await Promise.all([db.select().from(instanceSettings).where(eq(instanceSettings.id, ONLY)), db.select().from(capabilitySettings)]);
      return { settings: saved?.settings ?? null, capabilities: Object.fromEntries(capabilities.map((row) => [row.app, { enabled: row.enabled, markup: row.markup, surfaces: row.surfaces }])) };
    },
    async saveSettings(settings) {
      const values = { settings, updatedAt: new Date() };
      await db.insert(instanceSettings).values({ id: ONLY, ...values }).onConflictDoUpdate({ target: instanceSettings.id, set: values });
    },
    async saveCapability(app, saved) {
      const values = { enabled: saved.enabled, markup: saved.markup, surfaces: saved.surfaces, updatedAt: new Date() };
      await db.insert(capabilitySettings).values({ app, ...values }).onConflictDoUpdate({ target: capabilitySettings.app, set: values });
    },
    async reset(section) {
      if (section === "settings") await db.delete(instanceSettings);
      else await db.delete(capabilitySettings);
    },
  };
}

/** The instance's own. */
export const settingsStore = storeOver(postgresSettingsStore);
