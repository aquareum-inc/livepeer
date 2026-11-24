import type { InstanceConfig, Surface } from "@livepeer/config";
import type { InstanceSettings } from "@livepeer/operator-console";

/**
 * What the console saves is state, laid over the config the instance was deployed with; the app never writes
 * that config. These are the two layers, as plain functions of a config: the Settings page's fields, and each
 * capability's own settings. Everything else in the config (`auth`, `mobile`, `engine`, whether there is a
 * console at all) can only be changed where the instance is deployed, so nobody locks themselves out or
 * repoints sign-in from a web form.
 */

/** One capability's settings as the console saved them, in place of what the config says of it. */
export interface SavedCapability {
  enabled: boolean;
  /** Null for no markup of its own. */
  markup: number | null;
  /** Null to appear wherever it does by default. */
  surfaces: string[] | null;
}

/** The Settings page's view of a config. */
export function settingsOf(config: InstanceConfig): InstanceSettings {
  return {
    name: config.name,
    domain: config.domain ?? "",
    signUp: config.auth?.signUp ?? "open",
    surfaces: { app: config.surfaces.app, api: config.surfaces.api, mcp: config.surfaces.mcp, mobile: config.surfaces.mobile ?? false, mobileConsole: config.surfaces.mobileConsole ?? false },
    characters: config.content?.characters ?? true,
    adultContent: config.content?.adultContent ?? false,
    retainChats: config.privacy?.retainChats ?? false,
    primaryDark: config.theme?.dark?.primary ?? "",
    primaryLight: config.theme?.light?.primary ?? "",
    logoSymbol: config.logo?.symbol ?? "",
    logoWordmark: config.logo?.wordmark ?? "",
    logoTint: config.logo?.tint ?? true,
  };
}

const SIGN_UP: ReadonlyArray<InstanceSettings["signUp"]> = ["open", "invite", "closed"];

/**
 * Saved settings as the page's fields, whatever was saved: a field that is missing or of the wrong type,
 * because the page has gained or changed fields since, takes the config's own value.
 */
export function readSettings(saved: unknown, base: InstanceSettings): InstanceSettings {
  const value = (typeof saved === "object" && saved !== null ? saved : {}) as Record<string, unknown>;
  const text = (key: keyof InstanceSettings) => (typeof value[key] === "string" ? (value[key] as string) : (base[key] as string));
  const flag = (key: keyof InstanceSettings) => (typeof value[key] === "boolean" ? (value[key] as boolean) : (base[key] as boolean));
  const surfaces = (typeof value.surfaces === "object" && value.surfaces !== null ? value.surfaces : {}) as Record<string, unknown>;
  const surface = (key: keyof InstanceSettings["surfaces"]) => (typeof surfaces[key] === "boolean" ? (surfaces[key] as boolean) : base.surfaces[key]);
  return {
    name: text("name"),
    domain: text("domain"),
    signUp: SIGN_UP.find((entry) => entry === value.signUp) ?? base.signUp,
    surfaces: { app: surface("app"), api: surface("api"), mcp: surface("mcp"), mobile: surface("mobile"), mobileConsole: surface("mobileConsole") },
    characters: flag("characters"),
    adultContent: flag("adultContent"),
    retainChats: flag("retainChats"),
    primaryDark: text("primaryDark"),
    primaryLight: text("primaryLight"),
    logoSymbol: text("logoSymbol"),
    logoWordmark: text("logoWordmark"),
    logoTint: flag("logoTint"),
  };
}

/** A config with the Settings page's fields laid over it. */
export function withSettings(base: InstanceConfig, settings: InstanceSettings): InstanceConfig {
  const theme = {
    ...(settings.primaryDark ? { dark: { ...base.theme?.dark, primary: settings.primaryDark } } : {}),
    ...(settings.primaryLight ? { light: { ...base.theme?.light, primary: settings.primaryLight } } : {}),
  };
  const next: InstanceConfig = {
    ...base,
    name: settings.name.trim(),
    // The console stays as the config has it: it can't be switched off from inside itself.
    surfaces: { ...settings.surfaces, console: base.surfaces.console },
    auth: { ...base.auth, signUp: settings.signUp },
    content: { ...base.content, characters: settings.characters, adultContent: settings.adultContent },
    privacy: { ...base.privacy, retainChats: settings.retainChats },
  };
  if (settings.domain.trim()) next.domain = settings.domain.trim();
  else delete next.domain;
  if (Object.keys(theme).length > 0) next.theme = theme;
  else delete next.theme;
  if (settings.logoSymbol || settings.logoWordmark) {
    next.logo = { ...(settings.logoSymbol ? { symbol: settings.logoSymbol } : {}), ...(settings.logoWordmark ? { wordmark: settings.logoWordmark } : {}), tint: settings.logoTint };
  } else delete next.logo;
  return next;
}

const SURFACES: ReadonlyArray<Surface> = ["chat", "studio", "characters", "library", "live"];
const isSurface = (value: string): value is Surface => (SURFACES as ReadonlyArray<string>).includes(value);

/** A capability's settings as a config has them: where users are served and charged from. */
export function capabilityOf(config: InstanceConfig, app: string): SavedCapability {
  return {
    enabled: !(config.capabilities?.block ?? []).includes(app),
    markup: config.pricing?.markup?.perApp?.[app] ?? null,
    surfaces: config.capabilities?.overrides?.[app]?.surfaces ?? null,
  };
}

/**
 * A config with capabilities' saved settings laid over it: switched off is an exact entry in
 * `capabilities.block`, where it appears is `capabilities.overrides[app].surfaces`, and its markup is
 * `pricing.markup.perApp[app]`. The config's own patterns and labels are kept.
 */
export function withCapabilities(base: InstanceConfig, saved: Record<string, SavedCapability>): InstanceConfig {
  const apps = Object.keys(saved);
  if (apps.length === 0) return base;
  const block = (base.capabilities?.block ?? []).filter((rule) => !apps.includes(rule));
  const overrides = { ...base.capabilities?.overrides };
  const perApp = { ...base.pricing?.markup?.perApp };
  for (const [app, settings] of Object.entries(saved)) {
    if (!settings.enabled) block.push(app);
    const { surfaces: _previous, ...rest } = overrides[app] ?? {};
    const surfaces = settings.surfaces?.filter(isSurface);
    const entry = surfaces ? { ...rest, surfaces } : rest;
    if (Object.keys(entry).length > 0) overrides[app] = entry;
    else delete overrides[app];
    if (settings.markup === null) delete perApp[app];
    else perApp[app] = settings.markup;
  }
  const { perApp: _markups, ...markup } = base.pricing?.markup ?? {};
  return {
    ...base,
    capabilities: { ...base.capabilities, block, overrides },
    pricing: { ...base.pricing, markup: { ...markup, ...(Object.keys(perApp).length > 0 ? { perApp } : {}) } },
  };
}
