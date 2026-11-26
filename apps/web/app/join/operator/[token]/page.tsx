import { JoinTeam } from "@livepeer/operator-console";
import type { Metadata } from "next";

import { isFresh } from "@/lib/auth/fresh";
import { getSession } from "@/lib/auth/session";
import { brandOf, instance } from "@/lib/instance";
import { operators } from "@/lib/operators";
import { acceptOperatorInvitationAction } from "@/lib/operators/join";
import { joinPath } from "@/lib/operators/links";

export const metadata: Metadata = { title: "Join the team", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Where an invitation to the team opens. Anyone can read it: it says who is inviting and what the role
 * allows, and nothing else about the instance. Joining needs a sign-in, and that sign-in to be recent.
 */
export default async function JoinTeamPage({ params }: { params: Promise<{ token: string }> }) {
  const token = decodeURIComponent((await params).token);
  const [config, session, invitation] = await Promise.all([instance(), getSession(), operators().read(token)]);
  const here = joinPath(token);
  const signIn = `/sign-in?next=${encodeURIComponent(here)}`;
  return (
    <JoinTeam
      brand={brandOf(config)}
      instance={config.name}
      invitation={invitation}
      viewer={session ? { name: session.name, email: session.email } : null}
      current={session ? await operators().role(session.userId) : null}
      fresh={isFresh(session?.authenticatedAt)}
      signInHref={signIn}
      signInAgainHref={`${signIn}&fresh=1`}
      accept={acceptOperatorInvitationAction.bind(null, token)}
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
