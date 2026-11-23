"use client";

import type { AgentModel, CharacterCast, Offering, PromptStarter } from "@livepeer/api-client";
import { HomeScreen, messageFrom } from "@livepeer/user-app";
import { useRouter } from "next/navigation";

import { createConversationAction, listCastableCharactersAction, listMediaAction } from "@/lib/actions";
import { uploadFile } from "@/lib/upload";

export interface HomeProps {
  starters: PromptStarter[];
  offerings: Offering[];
  agentModels: AgentModel[];
  signedIn: boolean;
  /** Whether the instance has characters switched on. */
  characters: boolean;
  /** A character put on screen from their page. */
  cast: CharacterCast | null;
  backdrop: { video: string | null; poster: string | null; image: string | null; aurora: boolean };
}

export function Home({ signedIn, characters, ...props }: HomeProps) {
  const router = useRouter();
  return (
    <HomeScreen
      {...props}
      {...(signedIn ? { loadLibrary: listMediaAction, upload: uploadFile } : { guest: { signIn: () => window.location.assign("/sign-in"), characters } })}
      {...(signedIn && characters ? { loadCharacters: listCastableCharactersAction } : {})}
      onSubmit={async (value) => {
        // A guest can write a request; sending it is where they sign in.
        if (!signedIn) {
          window.location.assign("/sign-in");
          return;
        }
        const conversation = await createConversationAction(messageFrom(value));
        router.push(`/chat/${conversation.id}`);
      }}
    />
  );
}
