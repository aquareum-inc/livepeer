import { DATA_SOURCES, OPERATOR_DATA_SOURCES, isMockOnly, type DataSource, type EngineHealth } from "@livepeer/api-client";
import { SystemView } from "@livepeer/operator-console";
import type { Metadata } from "next";

import release from "../../../../../release.config.json";

import { alerts } from "@/lib/alerts";
import { env } from "@/lib/env";
import { mobileConsoleEnabled, operatorAudit, operatorDevices } from "@/lib/operator-devices";
import { getSession } from "@/lib/auth/session";
import { revokeAllOperatorPhonesAction, revokeOperatorPhoneAction, seeNewPhonesAction } from "@/lib/operator/actions";
import { operatorApi } from "@/lib/operator/client";
import { runDoctor } from "@/lib/operator/doctor";
import { pushSetup } from "@/lib/push";

/** Whether alerts can be sent to each kind of phone, and whether Apple or Google last refused the instance's credentials. */
async function alertConnections(): Promise<Array<{ to: string; detail: string }>> {
  const setup = await pushSetup();
  const refused = await alerts().refusals();
  return ([["ios", "iPhone"], ["android", "Android"]] as const).map(([platform, to]) => {
    const refusal = refused[platform];
    return { to, detail: refusal ? `credentials refused ${new Date(refusal.at).toISOString().slice(0, 16).replace("T", " ")} UTC (${refusal.detail})` : setup[platform].state === "none" ? "not set up" : setup[platform].detail };
  });
}

export const metadata: Metadata = { title: "System" };

export default async function SystemPage() {
  const client = await operatorApi();
  let health: EngineHealth | null = null;
  let healthError: string | null = null;
  let healthSource: DataSource = "mock";
  try {
    const result = await client.getEngineHealth();
    health = result.data;
    healthSource = result.source;
  } catch {
    healthError = "The engine didn't answer.";
  }
  // The phones added in the last two days, as this operator stands with each: tagged in the list below.
  const session = await getSession();
  const recent = session ? await operatorDevices().newPhones(session.userId) : { announced: [], dismissed: [], marked: [] };
  const mockOnly = isMockOnly({ MOCK_ONLY: env("MOCK_ONLY") });
  const resolve = (source: DataSource): DataSource => (mockOnly ? "mock" : source);
  const dataSources = [
    ...Object.entries(OPERATOR_DATA_SOURCES).map(([name, source]) => ({ name, source: resolve(source), area: "Operator console" })),
    ...Object.entries(DATA_SOURCES).map(([name, source]) => ({ name, source: resolve(source), area: "User app" })),
  ];
  return (
    <SystemView
      health={health}
      healthError={healthError}
      provider={{ name: client.provider.name, id: client.provider.id }}
      versions={{ app: release.version, enginePinned: release.engine.ref.slice(0, 12), engineRunning: healthSource === "live" ? (health?.version ?? null) : mockOnly ? "mock-only mode" : null }}
      checks={await runDoctor()}
      dataSources={dataSources}
      sources={[{ name: "getEngineHealth", source: healthSource }]}
      phones={{ phones: await operatorDevices().list(), added: [...recent.announced, ...recent.dismissed].map((phone) => phone.id), unseen: recent.marked.length, seen: seeNewPhonesAction, offered: await mobileConsoleEnabled(), revoke: revokeOperatorPhoneAction, revokeAll: revokeAllOperatorPhonesAction }}
      phoneActivity={await operatorAudit().list(200)}
      alerts={await mobileConsoleEnabled() ? await alertConnections() : null}
    />
  );
}
