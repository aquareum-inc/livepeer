import "server-only";

import { instance } from "../instance";
import type { SignInMethod } from "./types";

const DEFAULT: SignInMethod[] = ["apple", "coinbase", "discord", "google", "wallet", "email", "passkey"];

/** The sign-in methods this instance offers, in the order to show them. */
export async function signInMethods(): Promise<SignInMethod[]> {
  return (await instance()).auth?.methods ?? DEFAULT;
}
