import { DataSourceBadge } from "@livepeer/user-app";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Chat } from "@/components/chat";
import { api } from "@/lib/api";
import { composerOfferings } from "@/lib/catalogue";
import { charactersEnabled } from "@/lib/content";
import { appModels } from "@/lib/models";
import { isDev } from "@/lib/env";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const conversation = await (await api()).getConversation((await params).id);
  return { title: conversation.data?.title ?? "Chat" };
}

export default async function ChatPage({ params }: Props) {
  const { id } = await params;
  const client = await api();
  const [conversation, offerings, agentModels] = await Promise.all([client.getConversation(id), client.listOfferings(), client.listAgentModels()]);
  if (!conversation.data) notFound();
  const offered = await composerOfferings(offerings.data);
  const models = await appModels(offered);
  return (
    <>
      <Chat conversation={conversation.data} offerings={offered} agentModels={agentModels.data} models={models.data} characters={await charactersEnabled()} />
      {isDev ? (
        <DataSourceBadge
          sources={[
            { name: "listOfferings", source: offerings.source },
            { name: "listAgentModels", source: agentModels.source },
            { name: "listRunners (models)", source: models.source },
            { name: "getConversation", source: conversation.source },
            { name: "sendMessage", source: "mock" },
          ]}
        />
      ) : null}
    </>
  );
}
