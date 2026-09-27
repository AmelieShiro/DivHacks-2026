import { NextResponse } from "next/server";
import { isEnglish, translateWithGrok } from "@/lib/chat/grokTranslate";
import { rateLimit } from "@/lib/chat/rateLimit";

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

  const body = (await req.json()) as { text?: string; target?: string };
  const text = body.text?.trim() ?? "";
  const target = body.target?.trim() || "en";
  if (!text) return NextResponse.json({ error: "Nothing to translate." }, { status: 400 });
  if (isEnglish(target)) return NextResponse.json({ text });

  const translated = await translateWithGrok(text, target);
  return NextResponse.json({ text: translated });
}
