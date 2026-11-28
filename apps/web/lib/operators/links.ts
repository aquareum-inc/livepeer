/** Where an invitation to the team is opened. The page is public; accepting needs a sign-in. */
export const JOIN_PATH = "/join/operator/";

/** Where the first owner claims an instance nobody runs yet. It exists only until someone has. */
export const SETUP_PATH = "/setup";

export const joinPath = (token: string) => `${JOIN_PATH}${encodeURIComponent(token)}`;

/** The invitation token in a path such as the `next` a sign-in returns to, or null if it isn't a join link. */
export function invitationIn(path: string): string | null {
  const [pathname = ""] = path.split(/[?#]/);
  if (!pathname.startsWith(JOIN_PATH)) return null;
  const token = pathname.slice(JOIN_PATH.length);
  return token && !token.includes("/") ? decodeURIComponent(token) : null;
}
