"use client";

import type { OperatorTeam } from "@livepeer/api-client";
import { TeamView } from "@livepeer/operator-console";

import { inviteOperatorAction, removeOperatorAction, revokeInvitationAction, setOperatorRoleAction } from "@/lib/operator/actions";

/**
 * The Team page, wired to its actions. Someone who leaves has no console to stay in: they go to the app if
 * the instance has one, or else to sign-in (leaving signed them out), by a full page load so nothing of the
 * console is left on screen.
 */
export function TeamPanel({ team, me, origin, appAvailable }: { team: OperatorTeam; me: string; origin: string; appAvailable: boolean }) {
  return (
    <TeamView
      team={team}
      me={me}
      origin={origin}
      invite={inviteOperatorAction}
      revokeInvitation={revokeInvitationAction}
      setRole={setOperatorRoleAction}
      remove={removeOperatorAction}
      onLeft={() => window.location.assign(appAvailable ? "/" : "/sign-in")}
    />
  );
}
