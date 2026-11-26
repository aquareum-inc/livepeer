"use client";

import type { AccessKey, DataSource } from "@livepeer/api-client";
import { Button, Chip, Field, Input, Sheet } from "@livepeer/ui";
import { Plus } from "lucide-react";
import { useState, type FormEvent } from "react";

import { dateTime } from "../components/format";
import { ConsolePage, Panel, Status } from "../components/parts";
import { Table } from "../components/table";
import { useOperatorCan } from "../shell/role";

export interface KeysViewProps {
  keys: AccessKey[];
  issue: (input: { actor_id: string; label: string; kind: AccessKey["kind"] }) => Promise<{ key: AccessKey; token: string | null } | { error: string }>;
  revoke: (keyId: string) => Promise<AccessKey | null>;
  sources: ReadonlyArray<{ name: string; source: DataSource }>;
}

const KINDS: Array<{ value: AccessKey["kind"]; label: string; hint: string }> = [
  { value: "actor", label: "Builder", hint: "One account: runs jobs and reads its own data." },
  { value: "auditor", label: "Reader", hint: "Read-only across the application." },
  { value: "admin", label: "Admin", hint: "Everything, including keys and credit." },
];
const KIND_LABEL: Record<AccessKey["kind"], string> = { actor: "builder", auditor: "reader", admin: "admin", service: "service" };

export function KeysView({ keys: initial, issue, revoke, sources }: KeysViewProps) {
  const can = useOperatorCan();
  const [keys, setKeys] = useState(initial);
  const [creating, setCreating] = useState(false);
  const [kind, setKind] = useState<AccessKey["kind"]>("actor");
  const [actor, setActor] = useState("");
  const [label, setLabel] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<AccessKey | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await issue({ actor_id: actor.trim(), label: label.trim(), kind }).catch(() => ({ error: "The key wasn't issued." }));
    if ("error" in result) setError(result.error);
    else {
      setKeys((current) => [result.key, ...current]);
      setToken(result.token);
    }
    setBusy(false);
  };
  const close = () => {
    setCreating(false);
    setToken(null);
    setError(null);
    setActor("");
    setLabel("");
  };

  return (
    <ConsolePage
      title="API and admin keys"
      description="Engine access keys. Builder keys act as one account; reader keys read across accounts; admin keys can change anything."
      sources={sources}
      actions={can("manage_keys") ? <Button size="sm" variant="primary" onClick={() => setCreating(true)}><Plus />Issue key</Button> : null}
    >
      <Panel title="All keys">
        <Table
          caption="Access keys"
          rows={keys}
          rowKey={(key) => key.key_id}
          empty="No keys have been issued."
          columns={[
            { key: "label", header: "Key", cell: (key) => <span className="font-medium">{key.label || key.key_id}</span> },
            { key: "kind", header: "Kind", cell: (key) => KIND_LABEL[key.kind], mono: true },
            { key: "actor", header: "Account", cell: (key) => key.actor_id, mono: true, wide: true },
            { key: "status", header: "Status", cell: (key) => <Status value={key.revoked_at ? "revoked" : "active"} /> },
            { key: "created", header: "Created", cell: (key) => dateTime(key.created_at), mono: true, align: "right", wide: true },
            ...(can("manage_keys") ? [{ key: "act", header: "", align: "right" as const, cell: (key: AccessKey) => (key.revoked_at ? null : <Button size="sm" variant="ghost" onClick={() => setRevoking(key)}>Revoke</Button>) }] : []),
          ]}
        />
      </Panel>

      <Sheet open={creating} onOpenChange={(open) => !open && close()} title={token ? "Copy the key now" : "Issue a key"} description={token ? "It's shown once. Store it somewhere safe." : undefined}>
        {token ? (
          <div className="flex flex-col gap-3">
            <p className="break-all rounded-field bg-muted px-3 py-2.5 font-mono text-[12px]">{token}</p>
            <Button variant="primary" onClick={close}>Done</Button>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3">
            <div>
              <div className="flex gap-1.5" role="radiogroup" aria-label="Kind of key">
                {KINDS.map((option) => (
                  <Chip key={option.value} role="radio" aria-checked={kind === option.value} selected={kind === option.value} onClick={() => setKind(option.value)}>{option.label}</Chip>
                ))}
              </div>
              <p className="mt-1.5 text-caption text-muted-foreground">{KINDS.find((option) => option.value === kind)?.hint}</p>
            </div>
            <Field label="Account id"><Input value={actor} onChange={(event) => setActor(event.target.value)} placeholder="acme-studio" required className="font-mono" /></Field>
            <Field label="Label"><Input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Render agent" /></Field>
            {error ? <p role="alert" className="text-caption text-destructive">{error}</p> : null}
            <Button type="submit" variant="primary" disabled={busy || actor.trim() === ""}>{busy ? "Issuing…" : "Issue key"}</Button>
          </form>
        )}
      </Sheet>

      <Sheet open={revoking !== null} onOpenChange={(open) => !open && setRevoking(null)} title={`Revoke “${revoking?.label || revoking?.key_id || ""}”?`} description="Anything using this key stops working straight away. This can't be undone.">
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => setRevoking(null)}>Keep it</Button>
          <Button
            variant="destructive" className="flex-1"
            onClick={async () => {
              const result = revoking ? await revoke(revoking.key_id).catch(() => null) : null;
              if (result) setKeys((current) => current.map((key) => (key.key_id === result.key_id ? result : key)));
              setRevoking(null);
            }}
          >
            Revoke key
          </Button>
        </div>
      </Sheet>
    </ConsolePage>
  );
}
