import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { developerTabs } from "@/lib/developers";
import { instance } from "@/lib/instance";

/** The section exists while the instance serves the API or the MCP server. The proxy checks each tab. */
export default async function DevelopersSectionLayout({ children }: { children: ReactNode }) {
  if (developerTabs((await instance()).surfaces).length === 0) notFound();
  return children;
}
