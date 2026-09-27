/**
 * Minimal `text/event-stream` reader for the approve/reject continuation.
 *
 * The primary send path is streamed straight through to `useChat`, which
 * parses it natively. The approve path has no `useChat` continuation to hook
 * into, so this generator re-reads the same backend format on the client.
 */

export type SseEvent = {
  type: string;
  [key: string]: unknown;
};

const DONE = "[DONE]";

/** Parse one `data: ...` payload, ignoring the terminator sentinel. */
export function parseSseData(raw: string): SseEvent | null {
  const payload = raw.trim();
  if (!payload || payload === DONE) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") return null;
  const { type } = parsed as { type?: unknown };
  if (typeof type !== "string") return null;

  return parsed as SseEvent;
}

export async function* readSseStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<SseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const chunk = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);

        const data = chunk
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");

        const event = parseSseData(data);
        if (event) yield event;

        boundary = buffer.indexOf("\n\n");
      }
    }

    const trailing = parseSseData(
      buffer
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n"),
    );
    if (trailing) yield trailing;
  } finally {
    reader.releaseLock();
  }
}

export type SseEventHandlers = {
  onStatus?: (status: string) => void;
  onTextDelta?: (delta: string) => void;
  onTextStart?: () => void;
  onTextEnd?: () => void;
  onFinish?: () => void;
  onError?: (message: string) => void;
};

/** Drive a backend stream, dispatching only what the chat UI renders. */
export async function consumeChatStream(
  body: ReadableStream<Uint8Array>,
  handlers: SseEventHandlers,
): Promise<void> {
  for await (const event of readSseStream(body)) {
    switch (event.type) {
      case "data-status": {
        const data = event.data as { status?: unknown } | undefined;
        if (data && typeof data.status === "string") {
          handlers.onStatus?.(data.status);
        }
        break;
      }
      case "text-start":
        handlers.onTextStart?.();
        break;
      case "text-delta": {
        const delta = event.delta;
        if (typeof delta === "string") handlers.onTextDelta?.(delta);
        break;
      }
      case "text-end":
        handlers.onTextEnd?.();
        break;
      case "error": {
        const errorText = event.errorText;
        handlers.onError?.(
          typeof errorText === "string" ? errorText : "The agent reported an error.",
        );
        break;
      }
      case "finish":
        handlers.onFinish?.();
        break;
      default:
        break;
    }
  }
}
