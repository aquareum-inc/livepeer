import "server-only";

import { sessionSecret } from "../auth/session";
import { storeOver } from "../data/database";
import { postgresOperatorTeamStore } from "./postgres";
import { operatorTeam, type OperatorTeamService } from "./team";

const store = storeOver(postgresOperatorTeamStore);

/** The people who run this instance, and the invitations to join them. */
export function operators(): OperatorTeamService {
  const secret = sessionSecret();
  return operatorTeam(store(secret), secret);
}
