"use client";

import type { AgentModel, AppModel, Conversation, Offering } from "@livepeer/api-client";
import { ChatScreen } from "@livepeer/user-app";
import { useRouter } from "next/navigation";

import { getConversationAction, getGenerationAction, listCastableCharactersAction, listMediaAction, sendMessageAction } from "@/lib/actions";
import { uploadFile } from "@/lib/upload";

export function Chat({ conversation, offerings, agentModels, models, characters }: { conversation: Conversation; offerings: Offering[]; agentModels: AgentModel[]; models: AppModel[]; characters: boolean }) {
  const router = useRouter();
  return (
    <ChatScreen
      conversation={conversation}
      offerings={offerings}
      agentModels={agentModels}
      models={models}
      getConversation={getConversationAction}
      sendMessage={sendMessageAction}
      getGeneration={getGenerationAction}
      loadLibrary={listMediaAction}
      upload={uploadFile}
      {...(characters ? { loadCharacters: listCastableCharactersAction } : {})}
      onOpenMoment={(moment) =>
        router.push(`/studio/video?prompt=${encodeURIComponent(`Extend the moment “${moment.label}”, keeping the same subject and light`)}`)
      }
      onOpenInStudio={(generation) =>
        router.push(`/studio/video?prompt=${encodeURIComponent(generation.request.prompt)}`)
      }
    />
  );
}
