import { NextResponse } from "next/server";
import {
  BackendUnavailableError,
  getAccessToken,
  getBackendUrl,
  streamThrough,
} from "@/lib/backend";

// There is intentionally no `maxDuration` export here. It only ever applied to
// Vercel's serverless functions, and this app ships as a long-lived Node
// process on Railway precisely because a hard 300s kill mid-stream truncated the
// long agent builds the product depends on. Nothing enforces a ceiling on a
// stateful server, so re-adding it would advertise a limit that no longer
// exists. If this is ever deployed to a serverless target, add it back THERE,
// with a comment naming that platform.

type ChatRequestBody = {
  chatId?: unknown;
  messages?: unknown;
};

type WireMessage = {
  role?: unknown;
  parts?: unknown;
};

function lastUserContent(messages: unknown): string {
  if (!Array.isArray(messages)) return "";

  const userMessage = [...(messages as WireMessage[])]
    .reverse()
    .find((message) => message?.role === "user");
  if (!userMessage || !Array.isArray(userMessage.parts)) return "";

  return userMessage.parts
    .filter(
      (part): part is { type: string; text: string } =>
        !!part &&
        typeof part === "object" &&
        (part as { type?: unknown }).type === "text" &&
        typeof (part as { text?: unknown }).text === "string",
    )
    .map((part) => part.text)
    .join("")
    .trim();
}

function badRequest(message: string) {
  return NextResponse.json({ error: { message } }, { status: 400 });
}

/**
 * Streams a new user message to the FastAPI backend.
 *
 * `DefaultChatTransport` posts `{ chatId, id, messages, trigger, messageId }`;
 * we forward only the text of the last user message. `parent_id` is
 * deliberately omitted — `useChat` ids are client-generated, and the backend
 * rejects a `parent_id` that isn't a real row in the same chat. Omitting it
 * continues the chat's single thread.
 */
export async function POST(request: Request) {
  let body: ChatRequestBody;
  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return badRequest("Expected a JSON body.");
  }

  const chatId = typeof body.chatId === "string" ? body.chatId : "";
  if (!chatId) {
    return badRequest("Missing chatId.");
  }

  const content = lastUserContent(body.messages);
  if (!content) {
    return badRequest("Message content is required.");
  }

  let token: string;
  try {
    token = await getAccessToken();
  } catch {
    return NextResponse.json(
      { error: { message: "Not authenticated." } },
      { status: 401 },
    );
  }

  let res: Response;
  try {
    res = await fetch(
      `${getBackendUrl()}/api/v1/chats/${encodeURIComponent(chatId)}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content }),
      },
    );
  } catch (cause) {
    const error = new BackendUnavailableError(
      `Could not reach the backend at ${getBackendUrl()}. Is it running?`,
      { cause },
    );
    return NextResponse.json(
      { error: { message: error.message } },
      { status: 503 },
    );
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return NextResponse.json(
      { error: { message: detail || res.statusText || "Request failed" } },
      { status: res.status },
    );
  }

  return streamThrough(res);
}
