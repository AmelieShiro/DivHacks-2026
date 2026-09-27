import { NextResponse } from "next/server";
import { isEnglish, translateWithGrok } from "@/lib/chat/grokTranslate";

export async function POST(req: Request) {
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
