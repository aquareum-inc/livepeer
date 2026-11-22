export type PushPlatform = "ios" | "android";

/** One phone to send to. The push token is the phone's address at Apple or Google; it is never logged or answered. */
export interface PushTarget {
  platform: PushPlatform;
  token: string;
  /** Which of Apple's services issued the token: a development build's or a released build's. Android has one. */
  environment: "production" | "development";
}

/**
 * A visible notification. There is no other kind. On iOS the system shows it; on Android the app is handed the
 * words and shows them at once, and does nothing else with them: nothing sent makes the app call the instance
 * while nobody is looking.
 */
export interface PushNotification {
  title: string;
  body: string;
  /** What it is about, for the phone to route on: an alert kind, `test` or `session`. */
  kind: string;
  /** The place in the console it points at. The phone treats anything else as Status. */
  opens: "status" | "jobs" | "reports";
  /** A newer notification with the same value replaces the older one on the phone. */
  collapse: string;
  /** Not delivered within this long, it is dropped. */
  lifeSeconds: number;
  /** The Android channel it arrives in. */
  channel: "console_service" | "console_reports" | "console_sign_ins";
  /** May break through Focus on iOS, and is delivered at once on Android. Only the engine being down. */
  urgent: boolean;
}

/**
 * How a send ended. `gone`: Apple or Google says the push token is dead or isn't this app's, so it is dropped.
 * `refused`: they refused the instance's own credentials. `failed`: it couldn't be delivered to them after
 * retrying. `detail` is their reason in a word, never a push token or a credential.
 */
export interface PushResult {
  outcome: "sent" | "gone" | "refused" | "failed";
  detail: string | null;
}

export interface PushSender {
  /** Whether this sender can send to the platform at all. */
  offers(platform: PushPlatform): boolean;
  send(target: PushTarget, notification: PushNotification): Promise<PushResult>;
}

/** What a push token for each platform looks like. Anything else is refused before it is stored or sent to. */
export function validPushToken(platform: PushPlatform, token: string): boolean {
  return platform === "ios" ? /^[0-9a-fA-F]{64,400}$/.test(token) : /^[\w:.-]{32,4096}$/.test(token);
}
