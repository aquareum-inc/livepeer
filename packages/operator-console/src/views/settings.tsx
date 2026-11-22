"use client";

import { Button, Chip, Field, Input, Sheet, Switch } from "@livepeer/ui";
import { useState, type FormEvent } from "react";

import { BrandPreview, ColourInput, MarkRow } from "../components/appearance";
import { ConsolePage } from "../components/parts";

/** The editable part of the instance config. Mirrors packages/config's schema. */
export interface InstanceSettings {
  name: string;
  domain: string;
  signUp: "open" | "invite" | "closed";
  /** The surfaces an operator can switch here. The console isn’t one: switching it off from inside would lock everyone out. */
  surfaces: { app: boolean; api: boolean; mcp: boolean; mobile: boolean; mobileConsole: boolean };
  characters: boolean;
  adultContent: boolean;
  retainChats: boolean;
  primaryDark: string;
  primaryLight: string;
  /** The instance's marks: an uploaded image as a data URL, a path on the site or an https URL. Blank for none. */
  logoSymbol: string;
  logoWordmark: string;
  /** Draw the marks in the text colour, for a one-colour logo. */
  logoTint: boolean;
}

export interface SettingsViewProps {
  initial: InstanceSettings;
  /** Whether the config names an iOS or Android app built for this instance; the phone switch means nothing without one. */
  phoneAppsNamed: boolean;
  /** Where the config is stored, shown so operators know what a save changes. */
  file: string | null;
  save: (settings: InstanceSettings) => Promise<{ ok: true } | { ok: false; error: string }>;
}

const SIGN_UP: Array<{ value: InstanceSettings["signUp"]; label: string }> = [
  { value: "open", label: "Anyone" },
  { value: "invite", label: "By invitation" },
  { value: "closed", label: "Closed" },
];
const SURFACES: Array<{ key: keyof InstanceSettings["surfaces"]; label: string; name: string; hint: string; stops: string }> = [
  { key: "app", label: "User app", name: "the user app", hint: "Chat, studio, characters and library.", stops: "Every user loses chat, studio, characters and library, including anything they have open." },
  { key: "api", label: "API", name: "the API", hint: "The instance's REST API.", stops: "Apps and scripts built on the API stop working. Their keys stay valid, but every request is refused." },
  { key: "mcp", label: "MCP server", name: "the MCP server", hint: "Tools for agents.", stops: "Agents connected over MCP lose their tools." },
  { key: "mobile", label: "User app on phones", name: "the user app on phones", hint: "Chat, studio, characters and library in this instance's iOS and Android apps. Turn off to pause it, say while a bad release is fixed. Phones stay signed in.", stops: "The user app stops working on phones and says the service isn't offered there. Signed-in phones carry on when you turn it back on." },
  { key: "mobileConsole", label: "Console on phones", name: "the console on phones", hint: "Lets operators open this console in the phone app, behind Face ID or a fingerprint. They can check status, jobs, reports and users, decide a report and suspend a user. Keys, pricing, billing and settings stay here.", stops: "Operators' phones lose the console at once and say it isn't offered. Their phones stay enrolled and carry on when you turn it back on." },
];

/** "the API", "the API and the MCP server", "the user app, the API and the MCP server". */
function list(names: string[]): string {
  return names.length < 2 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** The surfaces a save would switch off: the ones worth a second look before saving. */
function turnedOff(saved: InstanceSettings, next: InstanceSettings) {
  return SURFACES.filter((surface) => saved.surfaces[surface.key] && !next.surfaces[surface.key]);
}

function Line({ label, hint, children }: { label: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="flex min-h-[48px] items-center justify-between gap-4 px-4 py-2">
      <div>
        <p className="text-[13px] font-medium">{label}</p>
        {hint ? <p className="text-[12px] text-muted-foreground">{hint}</p> : null}
      </div>
      {children ? <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">{children}</div> : null}
    </div>
  );
}

/** One group of settings: its name and what it covers on the left, the controls on the right; stacked on narrow screens. */
function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3 py-8 first:pt-2 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-10">
      <div>
        <h2 className="text-[13px] font-semibold">{title}</h2>
        <p className="mt-1 text-[12px] text-muted-foreground">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export function SettingsView({ initial, phoneAppsNamed, file, save }: SettingsViewProps) {
  const [value, setValue] = useState(initial);
  const [state, setState] = useState<{ kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string }>({ kind: "idle" });
  const set = (patch: Partial<InstanceSettings>) => {
    setValue((current) => ({ ...current, ...patch }));
    setState({ kind: "idle" });
  };
  // What the instance runs with now, so a second save compares against the first rather than the page load.
  const [saved, setSaved] = useState(initial);
  const [reviewing, setReviewing] = useState(false);
  const dirty = JSON.stringify(value) !== JSON.stringify(saved);
  const stopping = turnedOff(saved, value);
  const brand = { name: value.name || saved.name, symbol: value.logoSymbol || undefined, wordmark: value.logoWordmark || undefined, tint: value.logoTint };

  const commit = async () => {
    setReviewing(false);
    setState({ kind: "saving" });
    const result = await save(value).catch(() => ({ ok: false as const, error: "The settings didn't save." }));
    if (result.ok) setSaved(value);
    setState(result.ok ? { kind: "saved" } : { kind: "error", message: result.error });
  };

  // Switching a surface off takes it away from people straight away, so that save is reviewed first.
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (stopping.length > 0) setReviewing(true);
    else void commit();
  };

  return (
    <ConsolePage title="Instance settings" description="What this instance is called, who can join, what it serves and what it allows.">
      <form onSubmit={submit}>
        <div className="max-w-[920px] divide-y divide-hairline">
          <Section title="Identity" description="What the instance is called, and where it lives.">
            <div className="flex flex-col gap-4 rounded-card border border-hairline bg-card p-4">
              <Field label="Name"><Input value={value.name} onChange={(event) => set({ name: event.target.value })} maxLength={40} required /></Field>
              <Field label="Domain" hint="The public hostname, used in code samples and links."><Input value={value.domain} onChange={(event) => set({ domain: event.target.value })} placeholder="video.example.com" className="font-mono" /></Field>
            </div>
          </Section>

          <Section title="Appearance" description="How the app and the console look, in both themes.">
            <div className="divide-y divide-hairline rounded-card border border-hairline bg-card">
              <div className="p-3">
                <BrandPreview brand={brand} primary={{ dark: value.primaryDark, light: value.primaryLight }} />
              </div>
              <MarkRow kind="wordmark" label="Logo" fallback="shows the name" value={value.logoWordmark} brand={brand} onChange={(logoWordmark) => set({ logoWordmark })} />
              <MarkRow kind="symbol" label="Symbol" fallback="shows the first letter" value={value.logoSymbol} brand={brand} onChange={(logoSymbol) => set({ logoSymbol })} />
              <Line label="Match text colour" hint="White in the dark theme, black in the light. Off for a logo in colour.">
                <Switch checked={value.logoTint} onCheckedChange={(logoTint) => set({ logoTint })} aria-label="Match text colour" />
              </Line>
              <div className="flex flex-col gap-3 p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Primary, dark theme"><ColourInput label="Primary, dark theme" value={value.primaryDark} placeholder="oklch(0.922 0 0)" onChange={(primaryDark) => set({ primaryDark })} /></Field>
                  <Field label="Primary, light theme"><ColourInput label="Primary, light theme" value={value.primaryLight} placeholder="oklch(0.205 0.006 286)" onChange={(primaryLight) => set({ primaryLight })} /></Field>
                </div>
                <p className="text-caption text-subtle-foreground">Any CSS colour. Blank keeps the default.</p>
              </div>
            </div>
          </Section>

          <Section title="Sign-up and privacy" description="Who can join, and what the instance keeps.">
            <div className="divide-y divide-hairline rounded-card border border-hairline bg-card">
              <Line label="Who can sign up">
                {SIGN_UP.map((option) => (
                  <Chip key={option.value} selected={value.signUp === option.value} aria-pressed={value.signUp === option.value} onClick={() => set({ signUp: option.value })}>{option.label}</Chip>
                ))}
              </Line>
              <Line label="Keep prompts and outputs on this server" hint="Off, the instance doesn't retain them. This is stated on the users' Privacy page.">
                <Switch checked={value.retainChats} onCheckedChange={(retainChats) => set({ retainChats })} aria-label="Keep prompts and outputs" />
              </Line>
            </div>
          </Section>

          <Section title="Surfaces" description="Which parts of the product this instance serves.">
            <div className="divide-y divide-hairline rounded-card border border-hairline bg-card">
              {SURFACES.map((surface) => ((surface.key === "mobile" || surface.key === "mobileConsole") && !phoneAppsNamed ? (
                // With no app named, phones can't sign in whatever the switch says, so there is nothing to switch.
                <Line key={surface.key} label={surface.label} hint={surface.key === "mobileConsole" ? "Needs an iOS or Android app named in the config file, as above." : "No iOS or Android app is set up for this instance. Name one under mobile in the config file (mobile.ios.bundleId, mobile.android.applicationId) to offer it."} />
              ) : (
                <Line key={surface.key} label={surface.label} hint={surface.hint}>
                  <Switch checked={value.surfaces[surface.key]} onCheckedChange={(checked) => set({ surfaces: { ...value.surfaces, [surface.key]: checked } })} aria-label={surface.label} />
                </Line>
              )))}
              <Line label="Operator console" hint="This console. To run an instance without it, set surfaces.console to false in the config file.">
                <Switch checked disabled aria-label="Operator console, always on here" />
              </Line>
            </div>
          </Section>

          <Section title="Content policy" description="What people can make and see here.">
            <div className="divide-y divide-hairline rounded-card border border-hairline bg-card">
              <Line label="Characters and companions" hint="Shows Characters in the app, including live calls.">
                <Switch checked={value.characters} onCheckedChange={(characters) => set({ characters })} aria-label="Characters and companions" />
              </Line>
              <Line label="Adult content" hint="Lets users switch it on for themselves, after confirming their age. Off by default for every user.">
                <Switch checked={value.adultContent} onCheckedChange={(adultContent) => set({ adultContent })} aria-label="Adult content" />
              </Line>
            </div>
          </Section>
        </div>

        <div className="sticky bottom-0 -mx-4 flex items-center gap-3 border-t border-hairline bg-panel px-4 py-3 md:-mx-6 md:px-6">
          <Button type="submit" variant="primary" disabled={!dirty || state.kind === "saving"}>{state.kind === "saving" ? "Saving…" : "Save changes"}</Button>
          <p role="status" className={`text-[13px] ${state.kind === "error" ? "text-destructive" : "text-muted-foreground"}`}>
            {state.kind === "saved" ? "Saved. Changes apply on the next request." : state.kind === "error" ? state.message : dirty ? "Unsaved changes." : <>Saves to <span className="font-mono">{file ? file.split("/").pop() : "instance.config.json"}</span>, checked against the config schema.</>}
          </p>
        </div>
      </form>

      <Sheet
        open={reviewing}
        onOpenChange={setReviewing}
        title={`Turn off ${list(stopping.map((surface) => surface.name))}?`}
        description={`This applies as soon as you save. You can turn ${stopping.length > 1 ? "them" : "it"} back on here.`}
      >
        <ul className="mb-4 flex flex-col gap-2">
          {stopping.map((surface) => (
            <li key={surface.key} className="text-[13px]">
              <span className="font-medium">{surface.label}.</span> <span className="text-muted-foreground">{surface.stops}</span>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => setReviewing(false)}>{stopping.length > 1 ? "Keep them on" : "Keep it on"}</Button>
          <Button variant="destructive" className="flex-1" onClick={() => void commit()}>Turn off and save</Button>
        </div>
      </Sheet>
    </ConsolePage>
  );
}
