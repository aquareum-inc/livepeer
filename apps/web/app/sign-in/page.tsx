import { BrandSymbol, Button, Input } from "@livepeer/ui";
import { KeyRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AppleMark, CoinbaseMark, DiscordMark, GoogleMark, WalletConnectMark } from "@/components/provider-marks";
import { signInMethods } from "@/lib/auth/methods";
import { authProvider, getSession } from "@/lib/auth/session";
import { brandOf, instance } from "@/lib/instance";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  expired: "That sign-in attempt expired. Choose how to sign in again.",
  failed: "Sign-in didn’t complete. Try again, or pick another way.",
};

const PROVIDERS = [
  { method: "apple", label: "Apple", Mark: AppleMark },
  { method: "coinbase", label: "Coinbase", Mark: CoinbaseMark },
  { method: "discord", label: "Discord", Mark: DiscordMark },
  { method: "google", label: "Google", Mark: GoogleMark },
  { method: "wallet", label: "a wallet (WalletConnect)", Mark: WalletConnectMark },
] as const;

const safeNext = (value: string | undefined) => (value && value.startsWith("/") && !value.startsWith("//") ? value : "/");

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next: rawNext, error } = await searchParams;
  const next = safeNext(rawNext);
  if (await getSession()) redirect(next);

  const config = await instance();
  const offered: string[] = await signInMethods();
  const providers = PROVIDERS.filter((provider) => offered.includes(provider.method));
  const email = offered.includes("email");
  const passkey = offered.includes("passkey");
  const development = (await authProvider()).id === "mock";
  const signUp = config.auth?.signUp ?? "open";
  const start = (method: string) => `/auth/start?method=${method}&next=${encodeURIComponent(next)}`;

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-[420px] overflow-hidden rounded-sheet border border-hairline bg-card">
        <div className="p-8">
          <BrandSymbol brand={brandOf(config)} className="mx-auto h-7 w-auto" />
          <h1 className="mt-6 text-center text-title font-semibold tracking-[-0.01em]">Sign in to {config.name}</h1>
          {error ? (
            <p role="alert" className="mt-3 text-center text-body text-destructive">
              {ERRORS[error] ?? ERRORS.failed}
            </p>
          ) : null}

          {providers.length > 0 ? (
            <div className="mt-7 flex gap-2">
              {providers.map(({ method, label, Mark }) => (
                <a
                  key={method}
                  href={start(method)}
                  aria-label={`Sign in with ${label}`}
                  title={`Sign in with ${label}`}
                  className="flex h-12 flex-1 items-center justify-center rounded-field border border-hairline text-foreground transition-[background-color,transform] duration-200 ease-out-expo hover:bg-hover active:scale-[0.97]"
                >
                  <Mark className="size-[22px]" />
                </a>
              ))}
            </div>
          ) : null}

          {providers.length > 0 && email ? (
            <div className="my-6 flex items-center gap-3 text-caption text-subtle-foreground">
              <span className="h-px flex-1 bg-hairline" />
              or
              <span className="h-px flex-1 bg-hairline" />
            </div>
          ) : (
            <div className="mt-6" />
          )}

          {email ? (
            <form action="/auth/start" method="get" className="flex flex-col gap-3">
              <input type="hidden" name="method" value="email" />
              <input type="hidden" name="next" value={next} />
              <label htmlFor="email" className="text-caption font-medium">
                Email address
              </label>
              <Input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required className="h-12 text-lead" />
              <Button type="submit" variant="primary" size="lg">
                Continue
              </Button>
            </form>
          ) : null}

          {passkey ? (
            <a href={start("passkey")} className="mt-5 flex items-center justify-center gap-2 text-body text-muted-foreground transition-colors hover:text-foreground">
              <KeyRound className="size-4" aria-hidden />
              Use a passkey instead
            </a>
          ) : null}
        </div>

        <div className="border-t border-hairline bg-muted px-8 py-5 text-center text-body text-muted-foreground">
          {signUp === "open" ? <p>New here? Signing in for the first time creates your account.</p> : null}
          {signUp === "invite" ? <p>This instance is invitation only. Sign in with the address you were invited at.</p> : null}
          {signUp === "closed" ? <p>This instance isn’t taking new accounts.</p> : null}
          {config.surfaces.app ? (
            <p className="mt-1">
              Or{" "}
              <Link href="/" className="text-foreground underline underline-offset-2">
                look around without an account
              </Link>
              .
            </p>
          ) : null}
          {development ? (
            <p className="mt-3 border-t border-hairline pt-3 text-caption">
              Development sign-in: every method signs you in as a test user.{" "}
              <a href={start("operator")} className="text-foreground underline underline-offset-2">
                Sign in as the test operator
              </a>
              .
            </p>
          ) : null}
        </div>
      </div>
    </main>
  );
}
