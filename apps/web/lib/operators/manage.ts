import "server-only";

import type { NewOperatorInvitation, OperatorRole, OperatorTeam, TeamOperator } from "@livepeer/api-client";

import { operatorAudit, operatorDevices } from "../operator-devices";
import { operators } from "./index";
import type { Person, TeamChange } from "./store";

/** Whoever is changing the team, as the audit log names them. The instance's own API token has no person. */
export interface TeamActor {
  userId: string;
  name: string;
}

/**
 * Changes to the team as the console and the API make them: each is written to the audit log, and taking
 * someone off the team ends the console on their phones in the same breath. Whether the caller may make the
 * change is decided before this is reached.
 */
export interface TeamManagement {
  /** The team as someone with this role sees it. Only an owner is shown the invitations waiting. */
  view(role: OperatorRole): Promise<OperatorTeam>;
  invite(actor: TeamActor, role: OperatorRole): Promise<NewOperatorInvitation>;
  revokeInvitation(actor: TeamActor, id: string): Promise<boolean>;
  add(actor: TeamActor, person: Person, role: OperatorRole): Promise<TeamOperator>;
  setRole(actor: TeamActor, userId: string, role: OperatorRole): Promise<TeamChange>;
  remove(actor: TeamActor, userId: string): Promise<TeamChange>;
}

export function teamManagement(): TeamManagement {
  const team = operators();
  const audit = operatorAudit();
  const wrote = (actor: TeamActor, operation: string, target: string, detail: string) => audit.write("change", { ...actor, deviceId: null, deviceName: null }, { operation, target, detail });

  return {
    async view(role) {
      return { role, operators: await team.operators(), invitations: role === "owner" ? await team.invitations() : [] };
    },
    async invite(actor, role) {
      const invitation = await team.invite(role, actor.userId);
      await wrote(actor, "operator_create_invitation", invitation.id, role);
      return invitation;
    },
    async revokeInvitation(actor, id) {
      const revoked = await team.revoke(id);
      if (revoked) await wrote(actor, "operator_revoke_invitation", id, "revoked");
      return revoked;
    },
    async add(actor, person, role) {
      const added = await team.add(person, role, actor.userId);
      await wrote(actor, "operator_add_operator", person.userId, added.role);
      const listed = (await team.operators()).find((operator) => operator.user_id === person.userId);
      if (!listed) throw new Error("The person was added to the team but is no longer on it.");
      return listed;
    },
    async setRole(actor, userId, role) {
      const change = await team.setRole(userId, role);
      if (change === "done") await wrote(actor, "operator_set_operator_role", userId, role);
      return change;
    },
    async remove(actor, userId) {
      const change = await team.remove(userId);
      if (change === "done") {
        await wrote(actor, "operator_remove_operator", userId, actor.userId === userId ? "left" : "removed");
        await operatorDevices().revokeUser(userId, actor.userId === userId ? "left the team" : "removed from the team");
      }
      return change;
    },
  };
}

/** Why a change to someone's place on the team was refused, for whoever asked. */
export const TEAM_REFUSALS: Record<Exclude<TeamChange, "done">, string> = {
  missing: "That person isn't on the team any more.",
  last_owner: "The team needs an owner. Make someone else an owner first.",
  from_provider: "Your identity provider makes this person an operator. Change it there.",
};
