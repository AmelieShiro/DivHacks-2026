import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/chat/rateLimit";

/** Speak a catalog answer with Grok TTS. The API key never leaves the server. */
export async function POST(req: Request) {
  // Before any paid work: this route spends an xAI quota on every call.
  const allowed = rateLimit(req);
  if (!allowed.ok) {
    return NextResponse.json(
      { error: "Too many voice requests. Wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(allowed.retryAfterSeconds) } },
    );
  }

  const key = process.env.XAI_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "Voice needs an xAI API key. Add XAI_API_KEY to .env.local." },
      { status: 503 },
    );
  }

  const body = (await req.json()) as { text?: string };
  const text = body.text?.trim().slice(0, 1500) ?? "";
  if (!text) return NextResponse.json({ error: "Nothing to say." }, { status: 400 });

  const res = await fetch("https://api.x.ai/v1/tts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      voice_id: "eve",
      language: "en",
      text_normalization: true,
    }),
  });
  if (!res.ok) {
    return NextResponse.json({ error: "Grok could not speak that answer." }, { status: 502 });
  }

  return new NextResponse(res.body, {
    headers: { "Content-Type": res.headers.get("Content-Type") || "audio/mpeg" },
  });
}
