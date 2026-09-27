import { NextResponse } from "next/server";

const KEYTERMS = [
  "Nova",
  "DYCD",
  "COMPASS",
  "Brooklyn",
  "Queens",
  "Bronx",
  "Manhattan",
  "robotics",
  "STEM",
];

/** Turn a spoken question into text with Grok STT. The API key never leaves the server. */
export async function POST(req: Request) {
  const key = process.env.XAI_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "Voice needs an xAI API key. Add XAI_API_KEY to .env.local." },
      { status: 503 },
    );
  }

  const incoming = await req.formData();
  const file = incoming.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "No audio was recorded." }, { status: 400 });
  }
  if (file.size > 3_000_000) {
    return NextResponse.json({ error: "That recording is too long. Try a shorter question." }, { status: 413 });
  }

  const form = new FormData();
  form.append("model", "grok-voice-transcribe-2.0");
  for (const term of KEYTERMS) form.append("keyterm", term);
  form.append("file", file, file.name || "question.wav");

  const res = await fetch("https://api.x.ai/v1/stt", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!res.ok) {
    return NextResponse.json(
      { error: "Grok could not hear that. Try again, a little closer to the mic." },
      { status: 502 },
    );
  }

  const data = (await res.json()) as { text?: string; language?: string };
  const text = data.text?.trim() ?? "";
  if (!text) {
    return NextResponse.json({ error: "I didn’t catch a question. Try again." }, { status: 422 });
  }
  return NextResponse.json({ text, language: data.language || "en" });
}
