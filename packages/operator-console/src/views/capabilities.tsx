"use client";

import type { CapabilitySetting, DataSource, Offering } from "@livepeer/api-client";
import { Badge, Button, Input, Sheet, Switch } from "@livepeer/ui";
import { useState } from "react";

import { label } from "../components/format";
import { ConsolePage } from "../components/parts";
import { useOperatorCan } from "../shell/role";

export interface CapabilityRow {
  offering: Offering;
  kind: string;
  /** Where the mapping places it by default. */
  surfaces: string[];
  /** Allowed by the instance's allow and block rules. */
  allowed: boolean;
  setting: CapabilitySetting;
}

export interface CapabilitiesViewProps {
  rows: CapabilityRow[];
  defaultMarkup: number;
  update: (app: string, patch: Partial<Omit<CapabilitySetting, "app">>) => Promise<CapabilitySetting>;
  sources: ReadonlyArray<{ name: string; source: DataSource }>;
  /** False when neither the user app nor the phone apps are on, so nothing shows a capability on a surface. */
  placing: boolean;
  /** Whether anything has been set here over the config the instance was deployed with. */
  overridden: boolean;
  /** What was set here no longer makes a valid config, so the instance is running without it. */
  ignored: boolean;
  /** Forgets everything set here, and answers with the capabilities as the instance was deployed with them. */
  reset: () => Promise<CapabilityRow[]>;
}

const SURFACES = ["chat", "studio", "characters", "library", "live"];

function wholesale(offering: Offering): string {
  const low = offering.rate_low?.price_usd;
  if (!low) return "—";
  const perSecond = offering.rate_low?.unit === "seconds";
  const amount = Number(low) * (perSecond ? 3600 : 1);
  return `$${amount < 0.01 ? amount.toPrecision(1) : amount.toFixed(2)}${perSecond ? "/hr" : ""}`;
}

export function CapabilitiesView({ rows: initial, defaultMarkup, update, sources, placing, overridden, ignored, reset }: CapabilitiesViewProps) {
  const can = useOperatorCan();
  // Offering a capability is a member's to switch; what it costs and where it appears are an owner's.
  const prices = can("set_pricing");
  const [rows, setRows] = useState(initial);
  const [failed, setFailed] = useState<string | null>(null);
  // Whether there is anything set here to forget, and whether what was set is being left out.
  const [kept, setKept] = useState({ saved: overridden, ignored });
  const [resetting, setResetting] = useState(false);
  // Markup fields hold what was typed; a reset has to draw them again from what came back.
  const [drawn, setDrawn] = useState(0);

  const forget = async () => {
    setResetting(false);
    setFailed(null);
    try {
      setRows(await reset());
      setKept({ saved: false, ignored: false });
      setDrawn((count) => count + 1);
    } catch {
      setFailed("every capability");
    }
  };

  const save = async (app: string, patch: Partial<Omit<CapabilitySetting, "app">>) => {
    const previous = rows;
    setRows((current) => current.map((row) => (row.offering.app === app ? { ...row, setting: { ...row.setting, ...patch } } : row)));
    setFailed(null);
    try {
      const setting = await update(app, patch);
      setRows((current) => current.map((row) => (row.offering.app === app ? { ...row, setting } : row)));
      setKept({ saved: true, ignored: false });
    } catch {
      setRows(previous);
      setFailed(app);
    }
  };

  return (
    <ConsolePage title="Capabilities" description="Everything discovery returns from the network. Choose what this instance offers, what it charges and where each one appears." sources={sources} actions={kept.saved && prices ? <Button variant="ghost" onClick={() => setResetting(true)}>Reset to deployed config</Button> : null} note="Discovery is live. What you set here is kept by this instance over the config it was deployed with, and is what users are served and charged from; a change applies everywhere within 10 seconds. Allow and block rules come from the deployed config. Routing preferences need the engine to accept a routing constraint.">
      {failed ? <p role="alert" className="mb-3 text-[13px] text-destructive">The change to {failed} didn't save.</p> : null}
      {kept.ignored ? (
        <div role="status" className="mb-3 flex items-start gap-3 rounded-card border border-hairline bg-card px-4 py-3 text-[13px]">
          <Badge tone="warn" className="shrink-0 whitespace-nowrap">Not applied</Badge>
          <p className="text-muted-foreground">What was set here no longer makes a valid config in this version, so capabilities are as the instance was deployed with them. Change one to replace it, or reset.</p>
        </div>
      ) : null}
      {rows.length === 0 ? (
        <div className="rounded-card border border-dashed border-input px-6 py-12 text-center text-[13px] text-muted-foreground">
          Discovery returned nothing. Check the engine's discovery status on the System page.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-hairline bg-card">
          <table className="w-full border-collapse text-[13px] leading-[18px]">
            <caption className="sr-only">Capabilities</caption>
            <thead>
              <tr className="border-b border-hairline text-left text-[11px] font-medium uppercase tracking-[0.04em] text-subtle-foreground">
                <th scope="col" className="h-9 pl-4 pr-3 font-medium">Capability</th>
                {placing ? <th scope="col" className="hidden h-9 px-3 font-medium lg:table-cell">Appears in</th> : null}
                <th scope="col" className="hidden h-9 px-3 text-right font-medium md:table-cell">Runners</th>
                <th scope="col" className="h-9 px-3 text-right font-medium">Wholesale</th>
                <th scope="col" className="h-9 px-3 text-right font-medium">Markup</th>
                <th scope="col" className="h-9 pl-3 pr-4 text-right font-medium">Offered</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {rows.map(({ offering, kind, surfaces, allowed, setting }) => {
                const shown = setting.surfaces ?? surfaces;
                return (
                  <tr key={`${offering.app}:${offering.rate_low?.unit ?? ""}:${drawn}`} className="transition-colors duration-150 hover:bg-hover">
                    <td className="py-2 pl-4 pr-3">
                      <p className="flex flex-wrap items-center gap-1.5 font-medium">
                        {label(offering.app)}
                        {offering.modes.includes("persistent") ? <Badge>Session</Badge> : null}
                        {allowed ? null : <Badge tone="warn">Blocked by config</Badge>}
                      </p>
                      <p className="font-mono text-[11px] text-subtle-foreground">{offering.app} · {kind}</p>
                    </td>
                    {placing ? <td className="hidden px-3 lg:table-cell">
                      <div className="flex flex-wrap gap-1" role="group" aria-label={`Surfaces for ${offering.app}`}>
                        {SURFACES.map((surface) => {
                          const on = shown.includes(surface);
                          return (
                            <button
                              key={surface}
                              type="button"
                              aria-pressed={on}
                              disabled={!prices}
                              onClick={() => save(offering.app, { surfaces: on ? shown.filter((entry) => entry !== surface) : [...shown, surface] })}
                              className={`h-6 rounded-full px-2 text-[11px] font-medium transition-colors ${on ? "bg-active text-foreground" : "text-subtle-foreground hover:bg-hover hover:text-foreground"}`}
                            >
                              {surface}
                            </button>
                          );
                        })}
                      </div>
                    </td> : null}
                    <td className="hidden px-3 text-right font-mono text-[12px] text-muted-foreground md:table-cell">{offering.ready_count}/{offering.runner_count}</td>
                    <td className="px-3 text-right font-mono text-[12px] text-muted-foreground">{wholesale(offering)}</td>
                    <td className="px-3 text-right">
                      <Input
                        type="number"
                        min="1"
                        step="0.05"
                        aria-label={`Markup for ${offering.app}`}
                        placeholder={defaultMarkup.toFixed(2)}
                        defaultValue={setting.markup ?? ""}
                        disabled={!prices}
                        onBlur={(event) => {
                          const value = event.target.value ? Math.max(1, Number(event.target.value)) : null;
                          if (value !== setting.markup) void save(offering.app, { markup: value });
                        }}
                        className="ml-auto h-8 w-[76px] rounded-full px-3 text-right font-mono text-[12px]"
                      />
                    </td>
                    <td className="pl-3 pr-4 text-right">
                      <Switch checked={allowed && setting.enabled} disabled={!allowed || !can("switch_capability")} onCheckedChange={(enabled) => save(offering.app, { enabled })} aria-label={`Offer ${offering.app}`} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Sheet open={resetting} onOpenChange={setResetting} title="Reset capabilities to the deployed config?" description="Every capability goes back to how the instance was deployed with it, within 10 seconds: what you switched off is offered again, and your markups and placements are forgotten. That changes what people can use and what they are charged.">
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => setResetting(false)}>Keep what's set</Button>
          <Button variant="destructive" className="flex-1" onClick={() => void forget()}>Reset</Button>
        </div>
      </Sheet>
    </ConsolePage>
  );
}
