import { UIMessage } from "ai";

export const maxDuration = 30;

const DUMMY_RESPONSE = `Hey there! Welcome to BotChain AI.

This is a placeholder response to verify that the chat UI and streaming pipeline are working correctly. Once the FastAPI backend is wired up with Claude and n8n-mcp, you'll be able to describe automation workflows in plain English and have them built and deployed on your behalf.

For now, feel free to type anything and watch it stream back. The full flow—Kinde auth, Neon Postgres, and this chat interface—is live and ready for the real thing.`;

function generateId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 24);
}

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();
  const lastMessage = messages[messages.length - 1];

  if (!lastMessage) {
    return new Response("No messages provided", { status: 400 });
  }

  const messageId = generateId();
  const textId = generateId();

  const words = DUMMY_RESPONSE.split(" ");

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (line: string) => controller.enqueue(enc.encode(line + "\n\n"));

      send(`data: ${JSON.stringify({ type: "start", messageId })}`);
      send(`data: ${JSON.stringify({ type: "text-start", id: textId })}`);

      for (const word of words) {
        send(
          `data: ${JSON.stringify({ type: "text-delta", id: textId, delta: word + " " })}`,
        );
        await new Promise((r) => setTimeout(r, 30));
      }

      send(`data: ${JSON.stringify({ type: "text-end", id: textId })}`);
      send(`data: ${JSON.stringify({ type: "finish-step" })}`);
      send(`data: ${JSON.stringify({ type: "finish" })}`);
      send("data: [DONE]");

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "x-vercel-ai-ui-message-stream": "v1",
    },
  });
}
