import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/chat/rateLimit";
import { ttsLanguage } from "@/lib/chat/grokTranslate";
import { xaiFailure } from "@/lib/chat/xaiError";

/** Speak a catalog answer with Grok Voice TTS in the language that was asked. */
export async function POST(req: Request) {
  // Before any paid work: this route spends an xAI quota on every call.
  const allowed = await rateLimit(req);
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

  const body = (await req.json()) as { text?: string; language?: string };
  const text = body.text?.trim().slice(0, 1500) ?? "";
  if (!text) return NextResponse.json({ error: "Nothing to say." }, { status: 400 });
  const language = ttsLanguage(body.language || "auto");

  const res = await fetch("https://api.x.ai/v1/tts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      voice_id: "eve",
      language,
      text_normalization: true,
    }),
  });
  if (!res.ok) {
    const failure = await xaiFailure(res, "tts", "Grok could not speak that answer.");
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }

  return new NextResponse(res.body, {
    headers: { "Content-Type": res.headers.get("Content-Type") || "audio/mpeg" },
  });
}
