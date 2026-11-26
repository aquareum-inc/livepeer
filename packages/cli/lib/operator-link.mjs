import { createHmac, randomBytes } from "node:crypto";

/** How long a link from the CLI can be used for. */
export const LINK_HOURS = 72;

/**
 * A link that makes whoever opens it and signs in an owner of the instance, once. It is signed with the
 * instance's SESSION_SECRET and not stored anywhere: the instance checks the signature, and writes the
 * link's id down when it is used so it can't be used again (apps/web/lib/operators/team.ts, which signs the
 * same words). For the first owner of a new instance, and for an instance nobody can get into.
 */
export function operatorLink({ secret, origin, now = Date.now() }) {
  const id = `ops_${randomBytes(9).toString("base64url")}`;
  const expires = Math.floor(now / 1000) + LINK_HOURS * 3600;
  const signature = createHmac("sha256", secret).update(`operator-invitation.v1:${id}.${expires}`).digest("base64url");
  return { url: `${origin.replace(/\/$/, "")}/join/operator/${id}.${expires}.${signature}`, expiresAt: new Date(expires * 1000).toISOString() };
}
