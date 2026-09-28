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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Bot, Check, Copy, CupSoda, TriangleAlert, User } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getBothPlaceholders } from "@/lib/chat-ui-utils";
import {
  isPendingApproval,
  messageText,
  stripJsonBlocks,
  toUIMessage,
  type ChatUIMessage,
  type MessageOut,
} from "@/lib/chat-types";
import { consumeChatStream } from "@/lib/sse";
import { ApprovalGate } from "./approval-gate";
import { ChatCardMenu } from "../chat-card-menu";
import { WorkflowAttachment } from "./workflow-attachment";
import { Separator } from "@/components/ui/separator";

const HISTORY_PAGE_SIZE = 100;

export type ChatViewProps = {
  userId: string;
  chatId: string;
  chatTitle: string;
  initialMessages: ChatUIMessage[];
};

/** Pull the human-readable message out of whatever the proxy returned. */
function errorMessageFrom(error: unknown): string {
  if (error && typeof error === "object") {
    const responseBody = (error as { responseBody?: unknown }).responseBody;
    if (typeof responseBody === "string" && responseBody) {
      try {
        const parsed = JSON.parse(responseBody) as {
          error?: { message?: unknown };
        };
        if (typeof parsed?.error?.message === "string") {
          return parsed.error.message;
        }
      } catch {
        // Not our JSON envelope: fall through to the generic paths.
      }
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong. Please try again.";
}

export function ChatView({
  userId,
  chatId,
  chatTitle,
  initialMessages,
}: ChatViewProps) {
  const [liveStatus, setLiveStatus] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  /** Text streamed by the approve/resume call, which `useChat` cannot own. */
  const [resumed, setResumed] = useState<string | null>(null);
  const resumedTextRef = useRef("");

  const { placeholder, loadingState } = useMemo(() => getBothPlaceholders(), []);

  const transport = useMemo(
    () =>
      new DefaultChatTransport<ChatUIMessage>({
        api: "/api/chat",
        body: { chatId },
      }),
    [chatId],
  );

  const fetchHistory = useCallback(async (): Promise<ChatUIMessage[] | null> => {
    const res = await fetch(
      `/api/chats/${encodeURIComponent(chatId)}/messages?page_size=${HISTORY_PAGE_SIZE}`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    // The proxy returns raw backend `MessageOut` rows, so they have to go
    // through `toUIMessage` before `setMessages` — without the `parts` array
    // the renderer throws on the first `message.parts.map`.
    const { items } = (await res.json()) as { items: MessageOut[] };
    return items.map(toUIMessage);
  }, [chatId]);

  /**
   * Bumped when a turn ends so the effect below re-reads persisted history.
   * The backend commits the assistant row only after its stream finishes, so
   * this is the one point where the DB has the final text and gate state.
   */
  const [historyNonce, setHistoryNonce] = useState(0);

  const { messages, setMessages, sendMessage, status, stop, regenerate } =
    useChat<ChatUIMessage>({
      messages: initialMessages,
      transport,
      onData: (part) => {
        if (part.type === "data-status") {
          setLiveStatus(part.data.status);
        }
      },
      onFinish: ({ isAbort }) => {
        setLiveStatus(null);
        // On abort the assistant row was never committed; refetching would
        // discard the partial text the user is still reading.
        if (!isAbort) {
          setHistoryNonce((nonce) => nonce + 1);
        }
      },
      onError: (error) => {
        setLiveStatus(null);
        setRequestError(errorMessageFrom(error));
        setHistoryNonce((nonce) => nonce + 1);
      },
    });

  const refreshHistory = useCallback(async () => {
    const items = await fetchHistory();
    if (items) setMessages(items);
  }, [fetchHistory, setMessages]);

  useEffect(() => {
    if (historyNonce === 0) return;
    let cancelled = false;
    void (async () => {
      const items = await fetchHistory();
      if (!cancelled && items) setMessages(items);
    })();
    return () => {
      cancelled = true;
    };
  }, [historyNonce, fetchHistory, setMessages]);

  const isLoading = status === "submitted" || status === "streaming";
  const awaitingApproval = isPendingApproval(messages);

  const handleSubmit = (
    message: PromptInputMessage,
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    const trimmed = message.text.trim();
    if (!trimmed || isLoading || awaitingApproval) return;

    setRequestError(null);
    setResumed(null);
    resumedTextRef.current = "";
    void sendMessage({ text: trimmed });
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

  /** Resolve the approval gate, then stream the resumed agent run. */
  const resolveApproval = useCallback(
    async (approved: boolean, feedback?: string) => {
      if (approving) return;
      setApproving(true);
      setRequestError(null);
      setLiveStatus(null);
      resumedTextRef.current = "";
      setResumed("");

      try {
        const res = await fetch(
          `/api/chats/${encodeURIComponent(chatId)}/approve`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              approved,
              ...(feedback ? { feedback } : {}),
            }),
          },
        );

        if (!res.ok || !res.body) {
          const body = (await res.json().catch(() => null)) as {
            error?: { message?: string };
          } | null;
          setResumed(null);
          setRequestError(
            body?.error?.message ?? "Could not send your decision.",
          );
          return;
        }

        await consumeChatStream(res.body, {
          onStatus: setLiveStatus,
          onTextDelta: (delta) => {
            resumedTextRef.current += delta;
            setResumed(resumedTextRef.current);
          },
          onError: (message) => setRequestError(message),
        });

        // The backend persists the assistant row after the stream ends, so the
        // gate state and the finished text only exist server-side now.
        await refreshHistory();
        setResumed(null);
      } catch (error) {
        setResumed(null);
        setRequestError(errorMessageFrom(error));
      } finally {
        setLiveStatus(null);
        setApproving(false);
      }
    },
    [approving, chatId, refreshHistory],
  );

  const statusLine = liveStatus ?? (isLoading || approving ? loadingState : null);

  return (
    <section className="flex w-full items-center flex-1 flex-col border-x border-border bg-background">
      <header className="sticky top-0 z-20 w-full max-w-5xl border-b border-x border-border bg-background/90 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-6xl flex-col px-4 py-2.5 sm:px-6">
          <p className="text-foreground">
            route: /users/{userId}/chats/{chatId}
          </p>
          <div className="flex items-center justify-between gap-3">
            <Link
              href={`/users/${userId}`}
              className="text-sm text-primary hover:underline"
            >
              Back to Dashboard
            </Link>
            <ChatCardMenu
              chatId={chatId}
              title={chatTitle}
              redirectTo={`/users/${userId}/chats`}
            />
          </div>
        </div>
      </header>
      <main className="flex w-full flex-1 flex-col px-4 sm:px-6 border-x border-border">
        <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col">
          <div className="flex h-[calc(100dvh-5.5rem)] border border-t-0 border-border flex-col">
            <Conversation className="min-h-0">
              <ConversationContent>
                {messages.length === 0 ? (
                  <ConversationEmptyState
                    icon={<CupSoda className="size-12 " />}
                    title={placeholder}
                    description="Describe the automation you want and the agent will plan it before building anything."
                  />
                ) : (
                  <>
                    {messages.map((message) => {
                      const text = messageText(message);
                      const isCopied = copiedMessageId === message.id;
                      const meta = message.metadata;
                      const messageAttachments = meta?.attachments ?? [];
                      const hasError = Boolean(meta?.is_error);
                      const validation = meta?.validation;
                      const failedValidation =
                        meta?.approval?.status !== "pending" &&
                        validation !== undefined &&
                        validation.status !== "valid" &&
                        validation.errors.length > 0;

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
                            <MessageContent className="text-base leading-relaxed">
                              {message.parts.map((part, i) => {
                                switch (part.type) {
                                  case "text":
                                    return (
                                      <MessageResponse
                                        key={`${message.id}-${i}`}
                                      >
                                        {stripJsonBlocks(part.text)}
                                      </MessageResponse>
                                    );
                                  default:
                                    return null;
                                }
                              })}
                            </MessageContent>

                            {hasError && (
                              <Alert variant="destructive" className="mt-3">
                                <TriangleAlert />
                                <AlertTitle>Run failed</AlertTitle>
                                <AlertDescription>
                                  {text ||
                                    "The agent reported an error for this turn."}
                                </AlertDescription>
                              </Alert>
                            )}

                            {meta?.approval && (
                              <ApprovalGate
                                messageId={message.id}
                                spec={meta.spec}
                                approval={meta.approval}
                                busy={approving}
                                onApprove={() => void resolveApproval(true)}
                                onReject={(feedback) =>
                                  void resolveApproval(false, feedback)
                                }
                              />
                            )}

                            {failedValidation && validation && (
                              <Alert variant="destructive" className="mt-3">
                                <TriangleAlert />
                                <AlertTitle>
                                  Workflow validation failed
                                </AlertTitle>
                                <AlertDescription>
                                  <ul className="list-disc pl-4">
                                    {validation.errors.map((err) => (
                                      <li key={err}>{err}</li>
                                    ))}
                                  </ul>
                                </AlertDescription>
                              </Alert>
                            )}

                            {messageAttachments.map((attachment) => (
                              <WorkflowAttachment
                                key={attachment.id}
                                attachment={attachment}
                              />
                            ))}

                            {message.role === "assistant" && text && (
                              <div className="mt-2 flex items-center">
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger render={<div />}>
                                      <Button
                                        size="icon-sm"
                                        variant="ghost"
                                        onClick={() =>
                                          handleCopy(message.id, text)
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

                    {resumed && (
                      <div className="flex items-start gap-3 w-full max-w-[95%]">
                        <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-secondary text-secondary-foreground">
                          <Bot className="size-4 font-semibold" />
                        </div>
                        <Message from="assistant" className="flex-1">
                          <MessageContent className="text-base leading-relaxed">
                            <MessageResponse>
                              {stripJsonBlocks(resumed)}
                            </MessageResponse>
                          </MessageContent>
                        </Message>
                      </div>
                    )}

                    {statusLine && (
                      <div className="flex items-start gap-3 w-full max-w-[95%]">
                        <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-secondary text-secondary-foreground">
                          <Bot className="size-4" />
                        </div>
                        <div className="text-sm text-muted-foreground italic">
                          {statusLine}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </ConversationContent>
              <ConversationScrollButton />
            </Conversation>

            {requestError && (
              <Alert variant="destructive" className="mt-3">
                <TriangleAlert />
                <AlertTitle>Request failed</AlertTitle>
                <AlertDescription className="flex items-center justify-between gap-3">
                  <span>{requestError}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setRequestError(null);
                      void regenerate();
                    }}
                  >
                    Retry
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            <div className="mt-3 w-full max-w-3xl mx-auto sticky bottom-10 z-20 shrink-0">
              <PromptInput
                onSubmit={handleSubmit}
                className="w-full text-xl relative"
              >
                <PromptInputTextarea
                  placeholder="Describe an automation you want…"
                  className="pr-12 bg-background text-xl"
                  disabled={isLoading || approving || awaitingApproval}
                />
                <PromptInputSubmit
                  variant="outline"
                  status={isLoading || approving ? status : "ready"}
                  onStop={() => void stop()}
                  disabled={approving || awaitingApproval}
                  className="absolute right-4 hover:cursor-pointer"
                />
              </PromptInput>
            </div>

            {awaitingApproval && (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                This chat is waiting for your approval before the agent can
                build the workflow.
              </p>
            )}
          </div>
        </div>
      </main>
    </section>
  );
}
