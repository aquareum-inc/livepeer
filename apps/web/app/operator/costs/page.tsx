import { CostsView } from "@livepeer/operator-console";
import type { Metadata } from "next";

import { operatorApi, pricing } from "@/lib/operator/client";

export const metadata: Metadata = { title: "Costs" };

const DAYS = 30;

export default async function CostsPage() {
  const summary = await (await operatorApi()).getCostSummary(DAYS);
  const { default: base, perApp } = await pricing();
  return <CostsView summary={summary.data} days={DAYS} markup={{ default: base, perApp }} sources={[{ name: "getCostSummary", source: summary.source }, { name: "retail (markup rule)", source: "mock" }]} />;
}
