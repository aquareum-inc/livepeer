import "server-only";

import type { Offering } from "@livepeer/api-client";
import { capabilitiesFor, filterCapabilities, placeCapability, type Surface } from "@livepeer/config";
import type { CatalogueEntry } from "@livepeer/user-app";

import { instance } from "./instance";

const SURFACE_LABEL: Record<Surface, string> = { chat: "Chat", studio: "Studio", characters: "Characters", library: "Library", live: "Live mode" };
const KIND_LABEL = {
  "stream-support": "stream support",
  "realtime-character": "real-time character",
  "realtime-session": "real-time session",
  understanding: "understanding",
  generation: "generation",
  language: "language",
  "media-action": "media action",
  unmapped: "no dedicated surface",
} as const;

/** The capabilities this instance offers, each with where it is presented. */
export async function catalogue(offerings: Offering[]): Promise<CatalogueEntry[]> {
  const { capabilities } = await instance();
  return filterCapabilities(offerings, capabilities).map((offering) => {
    const placement = placeCapability(offering, capabilities?.overrides);
    return {
      offering,
      kind: KIND_LABEL[placement.kind],
      placement: placement.surfaces.length > 0 ? placement.surfaces.map((surface) => SURFACE_LABEL[surface]).join(", ") : "Catalogue, API and MCP only",
    };
  });
}

/** Capabilities the composer can hand a request to: those placed in chat (generation, language, understanding). */
export async function composerOfferings(offerings: Offering[]): Promise<Offering[]> {
  const { capabilities } = await instance();
  return capabilitiesFor("chat", filterCapabilities(offerings, capabilities), capabilities?.overrides);
}

/** Capabilities offered as actions on existing media. */
export async function mediaActions(offerings: Offering[]): Promise<Offering[]> {
  const { capabilities } = await instance();
  return filterCapabilities(offerings, capabilities).filter(
    (offering) => placeCapability(offering, capabilities?.overrides).mediaAction && offering.modes.includes("single-shot"),
  );
}

/** Capabilities the studio runs: those offered and placed in the studio. */
export async function studioOfferings(offerings: Offering[]): Promise<Offering[]> {
  const { capabilities } = await instance();
  return capabilitiesFor("studio", filterCapabilities(offerings, capabilities), capabilities?.overrides);
}

