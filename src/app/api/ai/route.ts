import { NextRequest, NextResponse } from "next/server";
import { getSession, hasRole } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (
    !session ||
    (!hasRole(session, "admin") && !hasRole(session, "dev"))
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { messages } = await request.json();
  const lastMessage = messages[messages.length - 1]?.content || "";

  // Placeholder: echo back a simple response
  // TODO: Connect to Anthropic API for real AI responses
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const response = `I received your message: "${lastMessage}"\n\nThe AI assistant is not yet connected to a language model. This is a placeholder response. Connect the Anthropic API to enable real AI-powered responses.`;

      const words = response.split(" ");
      let i = 0;

      const interval = setInterval(() => {
        if (i < words.length) {
          const text = (i === 0 ? "" : " ") + words[i];
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ text })}\n\n`)
          );
          i++;
        } else {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
          clearInterval(interval);
        }
      }, 30);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
