import { ReportsView } from "@livepeer/operator-console";
import type { Metadata } from "next";

import { moderation } from "@/lib/moderation";
import { resolveReportAction } from "@/lib/operator/actions";
import { requireOperator } from "@/lib/operator/client";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage() {
  await requireOperator();
  return <ReportsView reports={await moderation().reports()} resolve={resolveReportAction} />;
}
