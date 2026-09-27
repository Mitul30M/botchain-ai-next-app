import type { UIMessage } from "ai";

/**
 * Wire types mirroring the FastAPI backend's Pydantic schemas
 * (`app/schemas/chat.py`, `app/schemas/message.py`). This module is
 * isomorphic: the client renders from these shapes and the server uses them
 * for the initial history load, so it must never import the Kinde token helper.
 */

export type Paginated<T> = {
  items: T[];
  page: number;
  page_size: number;
  total: number;
};

export type ChatOut = {
  id: string;
  title: string;
  model: string;
  pinned: boolean;
  archived: boolean;
  meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type AttachmentOut = {
  id: string;
  file_name: string;
  file_type: string;
  file_url: string;
  size_bytes: number;
  created_at: string;
};

/** The requirements spec the planner fills in (`app/services/agent.py`). */
export type MessageSpec = {
  goal?: string | null;
  trigger_type?: string | null;
  services_involved?: string[] | null;
  conditions_logic?: string | null;
  data_flow?: string | null;
  constraints?: string | null;
  open_questions?: string[] | null;
};

export type MessageValidation = {
  status: string;
  errors: string[];
};

export type MessageApproval = {
  status: "pending" | "approved" | "rejected";
  feedback?: string | null;
};

/**
 * The backend's `meta` column. The keys present depend on the terminal phase
 * the agent reached — see `app/api/v1/messages.py::_terminal_meta`.
 */
export type MessageMeta = {
  phase?: "plan" | "confirm" | "build" | "done" | string;
  spec?: MessageSpec | null;
  approval?: MessageApproval;
  validation?: MessageValidation;
  workflow_json?: unknown;
  workflow_name?: string;
};

export type MessageOut = {
  id: string;
  chat_id: string;
  parent_id: string | null;
  role: "user" | "assistant";
  content: string;
  is_error: boolean;
  input_tokens: number | null;
  output_tokens: number | null;
  meta: MessageMeta;
  created_at: string;
  attachments: AttachmentOut[];
};

/**
 * A `UIMessage` carrying the backend's persisted `MessageOut` fields on
 * `metadata` (the SDK's only extension point) and a typed transient
 * `data-status` part so `useChat.onData` can read the agent's live progress.
 */
export type ChatUIMessage = UIMessage<
  MessageMeta & {
    chat_id: string;
    parent_id: string | null;
    is_error: boolean;
    input_tokens: number | null;
    output_tokens: number | null;
    created_at: string;
    attachments: AttachmentOut[];
  },
  { status: { status: string } }
>;

export function toUIMessage(message: MessageOut): ChatUIMessage {
  return {
    id: message.id,
    role: message.role,
    parts: message.content
      ? [{ type: "text", text: message.content, state: "done" }]
      : [],
    metadata: {
      ...message.meta,
      chat_id: message.chat_id,
      parent_id: message.parent_id,
      is_error: message.is_error,
      input_tokens: message.input_tokens,
      output_tokens: message.output_tokens,
      created_at: message.created_at,
      attachments: message.attachments,
    },
  };
}

export function messageText(message: ChatUIMessage): string {
  return message.parts
    .filter((part): part is Extract<typeof part, { type: "text" }> =>
      part.type === "text",
    )
    .map((part) => part.text)
    .join("");
}

export function lastAssistantMessage(
  messages: ChatUIMessage[],
): ChatUIMessage | undefined {
  return [...messages].reverse().find((message) => message.role === "assistant");
}

/** The chat is blocked on a human approval decision. */
export function isPendingApproval(messages: ChatUIMessage[]): boolean {
  return (
    lastAssistantMessage(messages)?.metadata?.approval?.status === "pending"
  );
}

/**
 * The backend returns `file_url` relative to itself
 * (`/api/v1/chats/{id}/messages/{id}/attachments/{id}/download`). Rewrite it onto
 * this app's authenticated proxy so the browser never talks to FastAPI directly
 * and the Kinde token stays server-side: only the version segment changes, so
 * the path keeps lining up with
 * `app/api/chats/[chatId]/messages/[messageId]/attachments/[attachmentId]/download`.
 */
export function attachmentHref(attachment: AttachmentOut): string {
  const path = attachment.file_url.startsWith("http")
    ? new URL(attachment.file_url).pathname
    : attachment.file_url;
  return path.replace(/^\/api\/v1(?=\/|$)/, "/api");
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = value >= 10 || unit === 0 ? Math.round(value) : +value.toFixed(1);
  return `${rounded} ${units[unit]}`;
}
