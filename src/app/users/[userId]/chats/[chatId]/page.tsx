"use client";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputMessage,
  PromptInputTextarea,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import { Bot, User, CupSoda, Copy, Check } from "lucide-react";
import { useChat } from "@ai-sdk/react";
import Link from "next/link";
import { getBothPlaceholders } from "@/lib/chat-ui-utils";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useParams } from "next/navigation";

const UserChatPage = () => {
  const { userId, chatId } = useParams<{ userId: string; chatId: string }>();
  const { messages, sendMessage, status, stop } = useChat();
  const { placeholder, loadingState } = useMemo(
    () => getBothPlaceholders(),
    [],
  );

  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  const handleSubmit = (
    message: PromptInputMessage,
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    const trimmedMessage = message.text.trim();
    if (trimmedMessage) {
      sendMessage({ text: trimmedMessage });
    }
  };

  const handleCopy = async (messageId: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch (error) {
      console.error("Failed to copy text:", error);
    }
  };

  const isLoading = status === "submitted" || status === "streaming";
  const isStreaming = status === "streaming";

  return (
    <section className="flex flex-col items-center justify-center">
      <div className="flex flex-col w-full  items-center justify-center bg-background font-sans">
        route: /users/{userId}/chats/{chatId}
        <Link
          href={`/users/${userId}/chats`}
          className="text-sm text-primary hover:underline"
        >
          Back to All Chats
        </Link>
      </div>
      <main className="flex flex-1 w-full h-full max-w-6xl flex-col items-center gap-5 mt-10 px-16 sm:items-center">
        <div className="flex w-full  flex-col items-center gap-10 py-2 px-16   sm:items-center">
          <div className="max-w-4xl   mx-auto p-4 self-center relative size-full rounded-lg border ">
            {/* <div className="flex flex-row gap-4">
              <ModeToggle />
            </div> */}
            <div className="flex flex-col h-162.5">
              <Conversation>
                <ConversationContent>
                  {messages.length === 0 ? (
                    <ConversationEmptyState
                      icon={<CupSoda className="size-12 " />}
                      title={placeholder}
                      description="Type a message below to begin chatting with the llm"
                    />
                  ) : (
                    <>
                      {messages.map((message) => {
                        const messageText = message.parts
                          .filter((part) => part.type === "text")
                          .map((part) => part.text)
                          .join("");
                        const isCopied = copiedMessageId === message.id;

                        return (
                          <div
                            key={message.id}
                            className={`flex items-start gap-3 w-full max-w-[95%] ${
                              message.role === "user"
                                ? "ml-auto flex-row-reverse"
                                : ""
                            }`}
                          >
                            <div
                              className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                                message.role === "user"
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-secondary text-secondary-foreground"
                              }`}
                            >
                              {message.role === "user" ? (
                                <User className="size-4 font-semibold" />
                              ) : (
                                <Bot className="size-4 font-semibold" />
                              )}
                            </div>
                            <Message from={message.role} className="flex-1">
                              <MessageContent>
                                {message.parts.map((part, i) => {
                                  switch (part.type) {
                                    case "text":
                                      return (
                                        <MessageResponse
                                          key={`${message.id}-${i}`}
                                        >
                                          {part.text}
                                        </MessageResponse>
                                      );
                                    default:
                                      return null;
                                  }
                                })}
                              </MessageContent>
                              {message.role === "assistant" && messageText && (
                                <div className="mt-2 flex items-center">
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger render={<div />}>
                                        <Button
                                          size="icon-sm"
                                          variant="ghost"
                                          onClick={() =>
                                            handleCopy(message.id, messageText)
                                          }
                                          className="h-6 w-6"
                                        >
                                          {isCopied ? (
                                            <Check className="size-3" />
                                          ) : (
                                            <Copy className="size-3" />
                                          )}
                                          <span className="sr-only">
                                            {isCopied
                                              ? "Copied!"
                                              : "Copy message"}
                                          </span>
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>
                                          {isCopied
                                            ? "Copied!"
                                            : "Copy message"}
                                        </p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </div>
                              )}
                            </Message>
                          </div>
                        );
                      })}
                      {status === "submitted" && (
                        <div className="flex items-start gap-3 w-full max-w-[95%]">
                          <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-secondary text-secondary-foreground">
                            <Bot className="size-4" />
                          </div>
                          <div className="text-sm text-muted-foreground italic">
                            {loadingState}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </ConversationContent>
                <ConversationScrollButton />
              </Conversation>
              <div className="mt-4 w-full max-w-2xl mx-auto relative">
                <PromptInput
                  onSubmit={handleSubmit}
                  className="w-full relative"
                >
                  <PromptInputTextarea
                    placeholder="Talk to me, Goose."
                    className="pr-12"
                    disabled={isLoading}
                  />
                  <PromptInputSubmit
                    variant={"outline"}
                    status={
                      isStreaming
                        ? "streaming"
                        : status === "submitted"
                          ? "submitted"
                          : "ready"
                    }
                    className={"absolute right-4 hover:cursor-pointer"}
                    type={isStreaming ? "button" : "submit"}
                    onClick={(e) => {
                      if (isStreaming) {
                        e.preventDefault();
                        stop();
                      }
                    }}
                  />
                </PromptInput>
              </div>
            </div>
          </div>
        </div>
      </main>
    </section>
  );
};
export default UserChatPage;
