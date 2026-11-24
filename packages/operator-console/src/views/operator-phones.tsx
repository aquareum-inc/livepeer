"use client";

import type { OperatorPhone } from "@livepeer/api-client";
import { Badge, Button, Sheet } from "@livepeer/ui";
import { useEffect, useState } from "react";

import { ago, dateTime, day } from "../components/format";
import { Panel, Status } from "../components/parts";
import { Table } from "../components/table";

export interface OperatorPhonesProps {
  phones: OperatorPhone[];
  /** The ids of the phones added in the last two days, which the list tags as new. */
  added: readonly string[];
  /** How many of those the sidebar still marks on System for this operator. */
  unseen: number;
  /** Tells the instance this operator has the list in front of them, so the mark on System can go. */
  seen: () => Promise<void>;
  /** Whether the instance offers the console on phones at all. */
  offered: boolean;
  /** Each answers with the phones still enrolled. */
  revoke: (id: string) => Promise<OperatorPhone[]>;
  revokeAll: () => Promise<OperatorPhone[]>;
}

/** How long ago, which the server and the browser work out a moment apart: the browser's answer stands. */
function Ago({ at }: { at: string }) {
  return <time dateTime={at} suppressHydrationWarning>{ago(at)}</time>;
}

const PLATFORM: Record<OperatorPhone["platform"], string> = { ios: "iOS", android: "Android" };

/**
 * Whether a phone is told when something needs an operator. Most are simply on or off; the badge is kept for
 * the one that needs someone: alerts that no longer reach the phone. A phone whose console has idled out is
 * still told until its session ends, and says so.
 */
function Alerts({ phone }: { phone: OperatorPhone }) {
  if (phone.alerts === "not_reaching") return <Status value="not_reaching" />;
  if (phone.alerts === "off") return <span className="text-subtle-foreground">Off</span>;
  return phone.signed_out ? <span className="whitespace-nowrap">Signed out · alerts until {day(phone.alerts_until)}</span> : <>On</>;
}

/** The same, in a few words under the phone's name: where a narrow screen has no room for the column. */
function alertsInWords(phone: OperatorPhone): string | null {
  if (phone.alerts === "off") return null;
  if (phone.alerts === "not_reaching") return "alerts not reaching";
  return phone.signed_out ? `signed out, alerts until ${day(phone.alerts_until)}` : "alerts on";
}

/** The phones enrolled for the console. Listing and revoking them is done here on the web, never from a phone. */
export function OperatorPhonesPanel({ phones: initial, added, unseen, seen, offered, revoke, revokeAll }: OperatorPhonesProps) {
  // With the list on screen the operator has what System's mark was pointing at, so the mark is taken away.
  // It runs when the page is really open, and again if a notice is closed while it is.
  useEffect(() => {
    if (unseen > 0) void seen().catch(() => undefined);
  }, [unseen, seen]);
  const [phones, setPhones] = useState(initial);
  const [asking, setAsking] = useState<OperatorPhone | "all" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (!asking) return;
    setBusy(true);
    setError(null);
    try {
      setPhones(asking === "all" ? await revokeAll() : await revoke(asking.id));
    } catch {
      setError("That didn't go through. Nothing was revoked.");
    }
    setBusy(false);
    setAsking(null);
  };

  return (
    <Panel
      title={phones.length === 0 ? "Operator phones" : `Operator phones (${phones.length})`}
      description="Phones that can open this console in the app, behind a face or fingerprint. Revoke one when a phone is lost or an operator leaves; removing their role alone doesn't end a session. A revoked phone is sent no more alerts."
      actions={phones.length > 1 ? <Button size="sm" variant="ghost" onClick={() => setAsking("all")}>Revoke all</Button> : null}
    >
      <div id="operator-phones" className="scroll-mt-6">
        {error ? <p role="alert" className="mb-2 text-caption text-destructive">{error}</p> : null}
        <Table
          caption="Operator phones"
          rows={phones}
          rowKey={(phone) => phone.id}
          empty={offered ? "No phones are enrolled. An operator adds one by opening the console in the app and signing in." : "The console on phones is off. Turn it on under Settings, in Surfaces."}
          columns={[
            {
              key: "phone",
              header: "Phone",
              cell: (phone) => (
                <span className="flex flex-col">
                  <span className="flex items-center gap-1.5 font-medium">
                    {phone.name}
                    {added.includes(phone.id) ? <Badge>New</Badge> : null}
                  </span>
                  <span className="font-mono text-[11px] text-subtle-foreground">
                    {PLATFORM[phone.platform]}
                    {alertsInWords(phone) ? <span className={phone.alerts === "not_reaching" ? "text-destructive md:hidden" : "md:hidden"}> · {alertsInWords(phone)}</span> : null}
                  </span>
                </span>
              ),
            },
            { key: "person", header: "Operator", cell: (phone) => phone.user_name },
            { key: "added", header: "Added", cell: (phone) => dateTime(phone.created_at), mono: true, wide: true },
            { key: "used", header: "Last used", cell: (phone) => <Ago at={phone.last_used_at} />, mono: true },
            { key: "unlocked", header: "Last unlocked", cell: (phone) => (phone.last_unlocked_at ? <Ago at={phone.last_unlocked_at} /> : "never"), mono: true, wide: true },
            { key: "expires", header: "Signs in again", cell: (phone) => dateTime(phone.expires_at), mono: true, wide: true },
            { key: "alerts", header: "Alerts", cell: (phone) => <Alerts phone={phone} />, wide: true },
            { key: "act", header: "", align: "right", cell: (phone) => <Button size="sm" variant="ghost" onClick={() => setAsking(phone)}>Revoke</Button> },
          ]}
        />
      </div>

      <Sheet
        open={asking !== null}
        onOpenChange={(value) => !value && setAsking(null)}
        title={asking === "all" ? "Revoke every operator phone?" : `Revoke ${asking?.name ?? "this phone"}?`}
        description={asking === "all" ? "The console stops on every phone at its next request, and none is sent another alert. Each operator signs in again on their phone to get it back. The user app on those phones isn't affected." : `The console stops on it at its next request, and it is sent no more alerts. ${asking?.user_name ?? "They"} can sign in again on the phone if they are still an operator. The user app on it isn't affected.`}
      >
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => setAsking(null)}>Keep {asking === "all" ? "them" : "it"}</Button>
          <Button variant="destructive" className="flex-1" disabled={busy} onClick={() => void confirm()}>{asking === "all" ? "Revoke all" : "Revoke"}</Button>
        </div>
      </Sheet>
    </Panel>
  );
}
