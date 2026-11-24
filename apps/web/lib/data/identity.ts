import "server-only";

import { seal, unseal } from "../auth/seal";

/** What the provider said of a person at sign-in, which it can't yet be asked for again. */
export interface KeptIdentity {
  name: string;
  email: string | null;
}

/**
 * How a name and an email are kept in the database: sealed with SESSION_SECRET, as the browser's session
 * cookie holds them, so no column reads as a person. The provider holds user records; this is only the copy
 * a phone's request needs while the provider can't answer `getUser`, and it goes when it can.
 */
export function identitySeal(secret: string) {
  return {
    seal: (identity: KeptIdentity): string => seal({ name: identity.name, email: identity.email }, secret),
    /** With a secret that has changed since, nothing opens: the person is then shown by their id. */
    open(sealed: string, userId: string): KeptIdentity {
      const kept = unseal<Partial<KeptIdentity>>(sealed, secret);
      return typeof kept?.name === "string" ? { name: kept.name, email: typeof kept.email === "string" ? kept.email : null } : { name: userId, email: null };
    },
  };
}
