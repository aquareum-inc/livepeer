/* Generated from schema/instance.schema.json by `pnpm --filter @livepeer/config generate`. Do not edit. */

/**
 * One file that defines an instance: branding, engine, surfaces, capability rules, auth, payments and content policy. Secrets never go here; they are environment variables.
 */
export interface InstanceConfig {
  $schema?: string;
  /**
   * Instance name shown in the interface.
   */
  name: string;
  /**
   * The instance's marks, as paths or URLs to images (SVG is best). Omitted, the name is set in type, and its first letter stands in for the symbol.
   */
  logo?: {
    /**
     * A square mark, for small places: the collapsed sidebar, sign-in and the agent's avatar.
     */
    symbol?: string;
    /**
     * The full logo, for the open sidebar and headers.
     */
    wordmark?: string;
    /**
     * Draw the marks in the text colour, black in the light theme and white in the dark, using only their shape. Turn off for a logo in more than one colour, which then shows as drawn in both themes.
     */
    tint?: boolean;
  };
  /**
   * Overrides for semantic colour tokens, per theme. Keys are token names without the leading dashes, e.g. "primary".
   */
  theme?: {
    dark?: Tokens;
    light?: Tokens;
  };
  /**
   * Public hostname of the instance.
   */
  domain?: string;
  engine?: {
    /**
     * Engine work-half REST API base URL. ENGINE_URL overrides it.
     */
    url?: string;
    /**
     * Clearinghouse REST API base URL. CLEARINGHOUSE_URL overrides it. Defaults to `url` when empty.
     */
    clearinghouseUrl?: string;
  };
  /**
   * Which parts of the product this instance serves.
   */
  surfaces: {
    /**
     * The user app.
     */
    app: boolean;
    /**
     * The operator console.
     */
    console: boolean;
    /**
     * The instance REST API.
     */
    api: boolean;
    /**
     * The MCP server.
     */
    mcp: boolean;
    /**
     * The native iOS and Android apps. Off, the instance issues no device sessions and refuses requests that carry one.
     */
    mobile?: boolean;
    /**
     * The operator console inside the native apps. Off, the instance issues no operator device sessions and refuses requests that carry one. Independent of mobile: a console-only instance turns this on alone.
     */
    mobileConsole?: boolean;
  };
  /**
   * The native apps built for this instance. Sign-in hands a finished session only to the apps named here.
   */
  mobile?: {
    ios?: {
      /**
       * The iOS app's bundle identifier. Sign-in returns to <bundleId>://auth.
       */
      bundleId: string;
      /**
       * Older builds are asked to update.
       */
      minimumVersion?: string;
    };
    android?: {
      /**
       * The Android app's application id. Sign-in returns to <applicationId>://auth.
       */
      applicationId: string;
      /**
       * Older builds are asked to update.
       */
      minimumVersion?: string;
      /**
       * The Firebase project that sends this app its operator alerts, as the project's settings give it for the Android app. None of it is secret: the app is sent these and starts Firebase Cloud Messaging with them. The service account that sends is FCM_SERVICE_ACCOUNT in .env.
       */
      firebase?: {
        /**
         * The project id, as in the service account's project_id.
         */
        projectId: string;
        /**
         * The Android app's id in the project, such as 1:1234567890:android:0a1b2c3d4e5f.
         */
        appId: string;
        /**
         * The project's Android API key. It identifies the project; it authorises nothing by itself.
         */
        apiKey: string;
        /**
         * The project number.
         */
        senderId: string;
      };
    };
  };
  /**
   * Which discovered capabilities the instance offers. Patterns match app names; * matches any run of characters. Block wins over allow. An empty allow list allows everything.
   */
  capabilities?: {
    allow?: string[];
    block?: string[];
    /**
     * Per-app overrides, keyed by app name.
     */
    overrides?: {
      [k: string]: {
        label?: string;
        surfaces?: ("chat" | "studio" | "characters" | "library" | "live")[];
      };
    };
  };
  auth?: {
    provider?: "mock" | "oidc";
    oidc?: {
      issuer: string;
      clientId: string;
      /**
       * Authorization request parameter that tells the provider which method the user picked (for example "connection" or "kc_idp_hint").
       */
      methodParam?: string;
    };
    signUp?: "open" | "invite" | "closed";
    /**
     * Sign-in methods offered on the sign-in screen, in order. The identity provider must support each one.
     */
    methods?: ("email" | "passkey" | "google" | "apple" | "discord" | "coinbase" | "wallet")[];
  };
  payments?: {
    provider?: "mock" | "batteries" | "pymthouse";
  };
  /**
   * How wholesale network cost becomes credits charged.
   */
  pricing?: {
    creditsPerUsd?: number;
    markup?: {
      /**
       * Multiplier on wholesale cost.
       */
      default?: number;
      perApp?: {
        [k: string]: number;
      };
    };
  };
  content?: {
    /**
     * Characters and companions.
     */
    characters?: boolean;
    /**
     * Allow adult content. Users still confirm their age and opt in.
     */
    adultContent?: boolean;
  };
  privacy?: {
    /**
     * Keep prompts and outputs on the instance's servers.
     */
    retainChats?: boolean;
  };
  /**
   * The home screen.
   */
  home?: {
    /**
     * URL or public path of a looping, silent video shown behind the home screen's composer.
     */
    backgroundVideo?: string;
    /**
     * Still image shown while the video loads, and in place of it when the visitor prefers reduced motion. With aurora, the opening frame shown while the live sky starts: the sky and stars without the aurora.
     */
    backgroundPoster?: string;
    /**
     * URL or public path of a photograph shown behind the composer when there is no video, brought gently to life with a slow drift and a shimmer in its coloured light. With neither, soft drifting light is shown.
     */
    backgroundImage?: string;
    /**
     * Draw a live aurora over backgroundImage, in place of any coloured glow in the photograph. Meant for a night-sky photo.
     */
    aurora?: boolean;
  };
}
export interface Tokens {
  [k: string]: string;
}
