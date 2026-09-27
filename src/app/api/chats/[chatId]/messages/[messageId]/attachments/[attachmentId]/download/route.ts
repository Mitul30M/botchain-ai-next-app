import { NextResponse } from "next/server";
import {
  BackendUnavailableError,
  getAccessToken,
  getBackendUrl,
} from "@/lib/backend";

type RouteContext = {
  params: Promise<{
    chatId: string;
    messageId: string;
    attachmentId: string;
  }>;
};

/**
 * Streams a generated n8n workflow file to the browser.
 *
 * The backend's `AttachmentOut.file_url` is already `/api/v1/chats/…/download`,
 * so this route mirrors that shape one-to-one and the client just rewrites the
 * prefix. Proxying keeps the Kinde token server-side and lets us surface the
 * backend's `Content-Disposition` filename.
 */
export async function GET(_request: Request, { params }: RouteContext) {
  const { chatId, messageId, attachmentId } = await params;

  let token: string;
  try {
    token = await getAccessToken();
  } catch {
    return NextResponse.json(
      { error: { message: "Not authenticated." } },
      { status: 401 },
    );
  }

  const backendPath =
    `/api/v1/chats/${encodeURIComponent(chatId)}` +
    `/messages/${encodeURIComponent(messageId)}` +
    `/attachments/${encodeURIComponent(attachmentId)}/download`;

  let res: Response;
  try {
    res = await fetch(`${getBackendUrl()}${backendPath}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
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
      { error: { message: detail || res.statusText || "Download failed" } },
      { status: res.status },
    );
  }

  if (!res.body) {
    return NextResponse.json(
      { error: { message: "Attachment body was empty." } },
      { status: 502 },
    );
  }

  const headers = new Headers({
    "Content-Type":
      res.headers.get("Content-Type") ?? "application/octet-stream",
    "Cache-Control": "private, no-store",
  });

  const disposition = res.headers.get("Content-Disposition");
  if (disposition) {
    headers.set("Content-Disposition", disposition);
  } else {
    headers.set("Content-Disposition", "attachment");
  }

  return new Response(res.body, { status: 200, headers });
}
