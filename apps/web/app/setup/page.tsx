import { ClaimInstance } from "@livepeer/operator-console";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { brandOf, instance } from "@/lib/instance";
import { operatorRoleOf } from "@/lib/operator/client";
import { claimInstanceAction } from "@/lib/operators/claim";
import { firstOwnerOpen } from "@/lib/operators/first-owner";
import { SETUP_PATH } from "@/lib/operators/links";

export const metadata: Metadata = { title: "Set up this instance", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Where the first owner claims an instance nobody runs yet. It needs a sign-in, and exists only while the
 * instance may be claimed this way (`firstOwnerOpen`): to everyone afterwards there is no such page.
 */
export default async function SetupPage() {
  const session = await getSession();
  const signIn = `/sign-in?next=${encodeURIComponent(SETUP_PATH)}`;
  if (!session) redirect(signIn);
  if (await operatorRoleOf(session)) redirect("/operator");
  if (!(await firstOwnerOpen())) notFound();
  const config = await instance();
  return (
    <ClaimInstance
      brand={brandOf(config)}
      instance={config.name}
      viewer={{ name: session.name, email: session.email }}
      claim={claimInstanceAction}
      switchAccount={
        <form action="/auth/sign-out" method="post">
          <input type="hidden" name="next" value={signIn} />
          Not you?{" "}
          <button type="submit" className="text-foreground underline underline-offset-2">
            Use another account
          </button>
        </form>
      }
    />
  );
}
