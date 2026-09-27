import { NextResponse } from "next/server";
import {
  BackendUnavailableError,
  getAccessToken,
  getBackendUrl,
  streamThrough,
} from "@/lib/backend";

export const maxDuration = 300;

const MAX_FEEDBACK_LENGTH = 2000;

type ApproveBody = {
  approved?: unknown;
  feedback?: unknown;
};

/**
 * Resolves the chat's pending human-approval gate and streams the resumed
 * agent run. The backend looks up the pending assistant message itself, so the
 * client never has to name it.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ chatId: string }> },
) {
  const { chatId } = await params;

  let body: ApproveBody;
  try {
    body = (await request.json()) as ApproveBody;
  } catch {
    body = {};
  }

  if (typeof body.approved !== "boolean") {
    return NextResponse.json(
      { error: { message: "`approved` must be a boolean." } },
      { status: 400 },
    );
  }

  const feedback =
    typeof body.feedback === "string" && body.feedback.trim()
      ? body.feedback.trim()
      : undefined;

  if (feedback && feedback.length > MAX_FEEDBACK_LENGTH) {
    return NextResponse.json(
      {
        error: {
          message: `Feedback must be ${MAX_FEEDBACK_LENGTH} characters or fewer.`,
        },
      },
      { status: 400 },
    );
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
      `${getBackendUrl()}/api/v1/chats/${encodeURIComponent(chatId)}/approve`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          approved: body.approved,
          ...(feedback ? { feedback } : {}),
        }),
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
