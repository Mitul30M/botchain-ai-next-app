import { NextResponse } from "next/server";
import { BackendUnavailableError, fetchBackend } from "@/lib/backend";
import type { MessageOut, Paginated } from "@/lib/chat-types";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

function readPositiveInt(value: string | null, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return parsed;
}

/** Persisted message history for a chat, newest page of the backend ordering. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ chatId: string }> },
) {
  const { chatId } = await params;
  const { searchParams } = new URL(request.url);

  const page = readPositiveInt(searchParams.get("page"), 1);
  const pageSize = Math.min(
    readPositiveInt(searchParams.get("page_size"), DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE,
  );

  try {
    const data = await fetchBackend<Paginated<MessageOut>>(
      `/api/v1/chats/${encodeURIComponent(chatId)}/messages?page=${page}&page_size=${pageSize}`,
    );
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: { message: describe(error) } },
      { status: statusFor(error) },
    );
  }
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Request failed";
}

function statusFor(error: unknown): number {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status: unknown }).status;
    if (typeof status === "number") return status;
  }
  if (error instanceof BackendUnavailableError) return 503;
  return 500;
}
