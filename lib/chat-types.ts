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

export type MessageValidationError = {
  node: string;
  message: string;
};

export type MessageValidation = {
  status: string;
  errors: MessageValidationError[];
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
  /**
   * USD cost of the message, `null` when the turn recorded no token usage
   * (user messages, and assistant runs that never reached a priced call).
   *
   * Typed as `string | number` because the backend declares it `Decimal`, which
   * Pydantic serializes to a JSON *string* — a plain `number` here would silently
   * render `$0.00` for a real `$0.075` cost. See `formatCredits`.
   */
  credits_cost: string | number | null;
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
    credits_cost: string | number | null;
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
      credits_cost: message.credits_cost,
      created_at: message.created_at,
      attachments: message.attachments,
    },
  };
}

/**
 * Drop raw JSON blocks from assistant text.
 *
 * The backend streams the LangGraph `messages` mode, which also carries token
 * fragments from the agent's internal plan/build/validate calls — so a built
 * workflow can arrive mid-reply as raw JSON. The persisted row comes from the
 * last committed assistant message and is clean, so this only ever trims the
 * live view; applying it at render time also keeps a JSON blob out of the UI if
 * one was persisted. A block is removed only when it parses as JSON, and a
 * still-streaming unterminated block is hidden once it clearly opens as JSON.
 */
export function stripJsonBlocks(text: string): string {
  if (!text) return text;

  let out = "";
  let index = 0;

  while (index < text.length) {
    const char = text[index];
    if (char !== "{" && char !== "[") {
      out += char;
      index += 1;
      continue;
    }

    const end = findBlockEnd(text, index);
    const block = end === -1 ? text.slice(index) : text.slice(index, end + 1);

    if (end !== -1) {
      if (parsesAsJson(block)) {
        index = end + 1;
        continue;
      }
      out += char;
      index += 1;
      continue;
    }

    // Unterminated: hide it while it is recognisably JSON, otherwise keep the
    // character so ordinary prose containing a brace is not swallowed.
    if (opensAsJson(block)) break;
    out += char;
    index += 1;
  }

  return out;
}

function parsesAsJson(block: string): boolean {
  try {
    const value: unknown = JSON.parse(block);
    return typeof value === "object" && value !== null;
  } catch {
    return false;
  }
}

/** First character after the opener, ignoring whitespace. */
function opensAsJson(block: string): boolean {
  const next = block[1]?.trim();
  return next === '"' || next === "{" || next === "[";
}

/** Index of the brace/bracket closing the one at `start`, or -1. */
function findBlockEnd(text: string, start: number): number {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const char = text[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{" || char === "[") {
      stack.push(char);
    } else if (char === "}" || char === "]") {
      const opener = stack.pop();
      if (!opener) return -1;
      const matched =
        (opener === "{" && char === "}") || (opener === "[" && char === "]");
      if (!matched) return -1;
      if (stack.length === 0) return i;
    }
  }

  return -1;
}

export function messageText(message: ChatUIMessage): string {
  return stripJsonBlocks(
    message.parts
      .filter((part): part is Extract<typeof part, { type: "text" }> =>
        part.type === "text",
      )
      .map((part) => part.text)
      .join(""),
  );
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

/**
 * Render a message's `credits_cost` as USD, or `""` when there is no cost.
 *
 * The backend quantizes to 6 decimal places, so a cheap message arrives as
 * `"0.075000"`. Sub-cent amounts keep enough precision to stay meaningful
 * (`$0.075`) while anything at or above a cent is trimmed to 2 decimals
 * (`$0.08`) — a real per-message run cost is normally well under a cent, so
 * rounding to cents unconditionally would show `$0.00` for most messages.
 */
export function formatCredits(cost: string | number | null): string {
  if (cost === null || cost === undefined || cost === "") return "";
  const value = typeof cost === "number" ? cost : Number(cost);
  if (!Number.isFinite(value)) return "";
  if (value === 0) return "$0.00";
  const digits = Math.abs(value) < 0.01 ? 4 : 2;
  return `$${value.toFixed(digits)}`;
}
