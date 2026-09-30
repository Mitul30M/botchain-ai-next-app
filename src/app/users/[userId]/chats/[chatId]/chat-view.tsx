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
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Bot, Check, Copy, CupSoda, TriangleAlert, User } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getBothPlaceholders } from "@/lib/chat-ui-utils";
import {
  formatCredits,
  isPendingApproval,
  messageText,
  stripJsonBlocks,
  toUIMessage,
  type ChatUIMessage,
  type MessageOut,
} from "@/lib/chat-types";
import { consumeChatStream } from "@/lib/sse";
import { ApprovalGate } from "./approval-gate";
import { WorkflowAttachment } from "./workflow-attachment";

const HISTORY_PAGE_SIZE = 100;

/**
 * Shared styling for the in-message failure cards.
 *
 * The `--chart-*` ramp is theme-invariant — `globals.css` declares identical
 * values under `:root` and `.dark` — so a chart token that reads as dark text
 * on white would be all but invisible on the dark background. Every foreground
 * therefore carries an explicit `dark:` partner, and the container color is set
 * so the `TriangleAlert` icon (which inherits `currentColor`) matches the title.
 */
const FAILURE_CARD =
  "mt-3 w-full max-w-[500px] self-center border-chart-1 bg-chart-1/20 text-chart-5 dark:border-chart-3/60 dark:bg-chart-3/15 dark:text-chart-1";
const FAILURE_DESCRIPTION = "text-chart-4 dark:text-chart-2";

export type ChatViewProps = {
  chatId: string;
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

/** Thousands-separated token count, or a dash when the backend sent no usage. */
function formatTokens(count: number | null): string {
  if (typeof count !== "number" || !Number.isFinite(count)) return "—";
  return count.toLocaleString();
}

/**
 * Token/cost breakdown for an assistant message, shown in a hover card on the
 * copy button.
 *
 * The whole card is gated on `hasUsage` in the caller: a message whose usage
 * columns are all NULL is not worth a hover target, and an empty card would
 * read as broken data rather than absent data.
 */
function MessageUsage({
  inputTokens,
  outputTokens,
  cost,
}: {
  inputTokens: number | null;
  outputTokens: number | null;
  cost: string | number | null;
}) {
  const formattedCost = formatCredits(cost);

  const rows: { label: string; value: string }[] = [
    { label: "Input tokens", value: formatTokens(inputTokens) },
    { label: "Output tokens", value: formatTokens(outputTokens) },
    { label: "Cost", value: formattedCost || "—" },
  ];

  return (
    <div className="flex flex-col gap-1.5">
      <p className="font-medium text-popover-foreground">Usage</p>
      <dl className="flex flex-col gap-1">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-4"
          >
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="font-mono tabular-nums text-popover-foreground">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

type MessageUsageData = {
  inputTokens: number | null;
  outputTokens: number | null;
  cost: string | number | null;
};

/**
 * Copy-message button for an assistant turn, with a usage hover card when the
 * backend recorded token counts for it.
 *
 * The hover card is anchored to a `div` wrapper rather than to the button
 * itself so the two overlays don't fight over the same trigger: the tooltip
 * opens below and the card above, so a pointer resting on the button doesn't
 * have two popovers stacked on one another.
 */
function MessageCopyAction({
  isCopied,
  onCopy,
  usage,
}: {
  isCopied: boolean;
  onCopy: () => void;
  usage: MessageUsageData | null;
}) {
  const label = isCopied ? "Copied!" : "Copy message";

  const button = (
    <Button
      size="icon-sm"
      variant="ghost"
      onClick={onCopy}
      className="h-6 w-6"
    >
      {isCopied ? <Check className="size-3" /> : <Copy className="size-3" />}
      <span className="sr-only">{label}</span>
    </Button>
  );

  const tooltip = (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger render={<div />}>{button}</TooltipTrigger>
        <TooltipContent>
          <p>{label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  return (
    <div className="mt-2 flex items-center">
      {usage ? (
        <HoverCard>
          <HoverCardTrigger
            render={<div className="flex items-center" />}
          >
            {tooltip}
          </HoverCardTrigger>
          <HoverCardContent className="w-56" side="top" sideOffset={8}>
            <MessageUsage {...usage} />
          </HoverCardContent>
        </HoverCard>
      ) : (
        tooltip
      )}
    </div>
  );
}

export function ChatView({ chatId, initialMessages }: ChatViewProps) {
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
    // The `SiteNav` above this section owns the top border and the `h-dvh`
    // wrapper (it lives in the server page, because async server components
    // can't render from a client one). This section therefore only has to take
    // the leftover height — `min-h-0` is what actually lets it shrink, and it's
    // why the wrapper needs the h-dvh rather than this element.
    <section className="flex min-h-0 w-full flex-1 flex-col overflow-hidden border-x border-b border-border bg-background">
      <main className="flex min-h-0 w-full flex-1 flex-col border-x border-border px-4 sm:px-6">
        <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col">
          {/* The nav's real height feeds the flex layout above instead of being
              guessed in a `calc(100dvh - header)`, so the bordered box ends
              flush with the viewport. */}
          <div className="flex min-h-0 flex-1 flex-col border border-t-0 border-border pb-3">
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
                      /**
                       * The backend leaves all three usage columns NULL when a
                       * turn never reached a priced call, so "no data" is the
                       * signal to skip the hover card entirely.
                       */
                      const hasUsage = Boolean(
                        typeof meta?.input_tokens === "number" ||
                          typeof meta?.output_tokens === "number" ||
                          meta?.credits_cost,
                      );
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
                              <Alert className={FAILURE_CARD}>
                                <TriangleAlert />
                                <AlertTitle>Run failed</AlertTitle>
                                <AlertDescription
                                  className={FAILURE_DESCRIPTION}
                                >
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
                              <Alert className={FAILURE_CARD}>
                                <TriangleAlert />
                                <AlertTitle>
                                  Workflow validation failed
                                </AlertTitle>
                                <AlertDescription
                                  className={FAILURE_DESCRIPTION}
                                >
                                  <ul className="list-disc pl-4">
                                    {validation.errors.map((err, i) => (
                                      <li key={`${err.node}-${i}`}>
                                        {err.message}
                                      </li>
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
                              <MessageCopyAction
                                isCopied={isCopied}
                                onCopy={() => handleCopy(message.id, text)}
                                usage={
                                  hasUsage
                                    ? {
                                        inputTokens:
                                          meta?.input_tokens ?? null,
                                        outputTokens:
                                          meta?.output_tokens ?? null,
                                        cost: meta?.credits_cost ?? null,
                                      }
                                    : null
                                }
                              />
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

            <div className="mt-3 w-full max-w-3xl mx-auto z-20 shrink-0">
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
