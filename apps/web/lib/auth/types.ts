export type Role = "user" | "operator";

/** What the sealed session cookie holds. The builder key never leaves the server. */
export interface Session {
  userId: string;
  name: string;
  email: string | null;
  role: Role;
  /** The signed-in user's engine key (lpk_…), sent on their behalf. */
  builderKey: string | null;
  /**
   * The workspace the person is working in, or absent for their personal account. Only a pointer: membership
   * and role are read from the provider on every request, so a removed member's cookie opens nothing.
   */
  workspaceId?: string | null;
  /** Unix seconds. */
  expiresAt: number;
}

/** A way to sign in. "operator" exists only for the development provider. */
export type SignInMethod = "email" | "passkey" | "google" | "apple" | "discord" | "coinbase" | "wallet" | "operator";

export interface Identity {
  userId: string;
  name: string;
  email: string | null;
  role: Role;
}

export interface Exchanged {
  identity: Identity;
  /** Unix seconds of the sign-in itself (OpenID Connect's `auth_time`), or null when the provider doesn't say. */
  authenticatedAt: number | null;
}

/**
 * An identity provider, shaped on OpenID Connect's authorization-code flow so a hosted provider
 * (for example a white-label login) plugs in without changes to the app.
 */
export interface AuthProvider {
  readonly id: "mock" | "oidc";
  /** Where to send the browser to sign in. `state` comes back on the callback. */
  authorizationUrl(input: {
    redirectUri: string;
    state: string;
    codeVerifier: string;
    /** The method picked on the sign-in screen. */
    method: SignInMethod;
    /** The email typed on the sign-in screen, for the email method. */
    email?: string;
    /** Ask the person to sign in again now, whatever session the provider already has for this browser. */
    fresh?: boolean;
  }): Promise<string>;
  /** Exchanges the callback's code for an identity, and when the provider says the person actually signed in. */
  exchange(input: { code: string; redirectUri: string; codeVerifier: string }): Promise<Exchanged>;
}
