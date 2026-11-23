"use client";

import type { ApiKey, CreatedApiKey } from "@livepeer/api-client/types";
import { Badge, Button, Card, EmptyState, Field, Input, Sheet } from "@livepeer/ui";
import { KeyRound, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";

import { CodeBlock } from "./code-block";

export interface KeysScreenProps {
  initialKeys: ApiKey[];
  create: (label: string) => Promise<CreatedApiKey>;
  revoke: (id: string) => Promise<ApiKey | null>;
}

const date = (value: string | null) => (value ? new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value)) : "Never");

export function KeysScreen({ initialKeys, create, revoke }: KeysScreenProps) {
  const [keys, setKeys] = useState(initialKeys);
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<CreatedApiKey | null>(null);
  const [revoking, setRevoking] = useState<ApiKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const key = await create(label.trim());
      const { secret: _secret, ...listed } = key;
      setKeys((current) => [listed, ...current]);
      setCreated(key);
      setLabel("");
    } catch {
      setError("The key wasn't created. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const closeCreate = () => {
    setCreating(false);
    setCreated(null);
    setError(null);
  };

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button variant="primary" onClick={() => setCreating(true)}><Plus />New key</Button>
      </div>
      {keys.length === 0 ? (
        <EmptyState icon={KeyRound} title="No keys yet" body="Create a key to call this instance from your own code or an agent." />
      ) : (
        <Card className="divide-y divide-hairline">
          {keys.map((key) => (
            <div key={key.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-body font-medium">
                  {key.label}
                  {key.status === "revoked" ? <Badge tone="warn">Revoked</Badge> : null}
                </p>
                <p className="mt-0.5 font-mono text-[11px] text-subtle-foreground">
                  {key.prefix}… · created {date(key.created_at)} · last used {date(key.last_used_at)}
                </p>
              </div>
              {key.status === "active" ? <Button variant="ghost" size="sm" onClick={() => setRevoking(key)}>Revoke</Button> : null}
            </div>
          ))}
        </Card>
      )}

      <Sheet
        open={creating}
        onOpenChange={(open) => !open && closeCreate()}
        title={created ? "Copy your key now" : "New key"}
        description={created ? "This is the only time it's shown. Store it somewhere safe." : "Name it after where it will be used."}
      >
        {created ? (
          <div className="flex flex-col gap-4">
            <CodeBlock code={created.secret} />
            <Button variant="primary" onClick={closeCreate}>Done</Button>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <Field label="Name">
              <Input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Render agent" maxLength={60} autoFocus required />
            </Field>
            {error ? <p role="alert" className="text-caption text-destructive">{error}</p> : null}
            <Button type="submit" variant="primary" disabled={busy || label.trim() === ""}>{busy ? "Creating…" : "Create key"}</Button>
          </form>
        )}
      </Sheet>

      <Sheet
        open={revoking !== null}
        onOpenChange={(open) => !open && setRevoking(null)}
        title={`Revoke “${revoking?.label ?? ""}”?`}
        description="Anything using this key stops working straight away. This can't be undone."
      >
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => setRevoking(null)}>Keep it</Button>
          <Button
            variant="destructive" className="flex-1"
            onClick={async () => {
              const result = revoking ? await revoke(revoking.id) : null;
              if (result) setKeys((current) => current.map((key) => (key.id === result.id ? result : key)));
              setRevoking(null);
            }}
          >
            Revoke key
          </Button>
        </div>
      </Sheet>
    </>
  );
}

/** In a workspace, for a member: keys spend shared credit, so its owner and admins make them. */
export function KeysUnavailable({ workspace }: { workspace: string }) {
  return <EmptyState icon={KeyRound} title="Keys are made by owners and admins" body={`An API key spends ${workspace}'s credit, so only its owner and admins can make or see them. Ask one of them for a key, or switch to your personal account to make your own.`} />;
}
