import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";

/** Raised when the backend replies with a non-2xx status. */
export class BackendError extends Error {
  readonly status: number;
  readonly detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = "BackendError";
    this.status = status;
    this.detail = detail;
  }
}

export class BackendUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "BackendUnavailableError";
  }
}

export function getBackendUrl(): string {
  const base = process.env.BACKEND_URL?.trim();
  if (!base) {
    throw new BackendUnavailableError(
      "BACKEND_URL is not set. Add it to .env.local (see _env-example.txt).",
    );
  }
  return base.replace(/\/+$/, "");
}

/** Raw Kinde access token (JWT) for the signed-in user. */
export async function getAccessToken(): Promise<string> {
  const { getAccessTokenRaw } = getKindeServerSession();
  const token = await getAccessTokenRaw();
  if (!token) {
    throw new BackendError(401, "Missing Kinde access token");
  }
  return token;
}

type FetchBackendInit = Omit<RequestInit, "headers"> & {
  headers?: Record<string, string>;
  /** Skip the Authorization header for unauthenticated backend routes. */
  anonymous?: boolean;
};

async function errorFromResponse(res: Response): Promise<BackendError> {
  const raw = await res.text().catch(() => "");
  let detail = raw || res.statusText || "Request failed";

  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "detail" in parsed) {
      const value = (parsed as { detail: unknown }).detail;
      if (typeof value === "string") {
        detail = value;
      } else if (value != null) {
        // FastAPI validation errors arrive as a list of objects.
        detail = JSON.stringify(value);
      }
    }
  } catch {
    // Non-JSON error body: keep the raw text.
  }

  return new BackendError(res.status, detail);
}

/**
 * Authenticated JSON request to the FastAPI backend.
 * Throws {@link BackendError} on non-2xx so callers never have to branch.
 */
export async function fetchBackend<T>(
  path: string,
  { anonymous, headers, ...init }: FetchBackendInit = {},
): Promise<T> {
  const { getAccessTokenRaw } = getKindeServerSession();
  const token = anonymous ? null : await getAccessTokenRaw();

  if (!anonymous && !token) {
    throw new BackendError(401, "Missing Kinde access token");
  }

  let res: Response;
  try {
    res = await fetch(`${getBackendUrl()}${path}`, {
      ...init,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
    });
  } catch (cause) {
    throw new BackendUnavailableError(
      `Could not reach the backend at ${getBackendUrl()}. Is it running?`,
      { cause },
    );
  }

  if (!res.ok) {
    throw await errorFromResponse(res);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

/**
 * Header set the AI SDK client requires to treat a response as a UI message
 * stream. Forwarded verbatim from the backend on every streaming proxy.
 */
export const SSE_HEADERS: Record<string, string> = {
  "Content-Type": "text/event-stream",
  "x-vercel-ai-ui-message-stream": "v1",
  "x-accel-buffering": "no",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
};

/**
 * Pipe a backend UI message stream straight through to the client. The body is
 * never buffered or re-encoded, so transient `data-status` parts and the
 * `[DONE]` sentinel reach `useChat` exactly as the backend produced them.
 */
export function streamThrough(res: Response): Response {
  if (!res.body) {
    return new Response(null, { status: 502, statusText: "Empty stream body" });
  }
  return new Response(res.body, { status: 200, headers: SSE_HEADERS });
}
