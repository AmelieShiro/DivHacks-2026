/** Browser helpers for the voice option. Answers still come from the catalog. */

export function spokenAnswer(intro: string, names: string[]): string {
  const spoken = intro.replace(/\s+/g, " ").trim();
  if (!names.length) return spoken;
  const listed = names.slice(0, 3).join(", ");
  const extra = names.length > 3 ? `, and ${names.length - 3} more` : "";
  return `${spoken} The first programs are ${listed}${extra}.`;
}

function writeString(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
}

function encodeWav(buffer: AudioBuffer, sampleRate = 16_000): ArrayBuffer {
  const channels = 1;
  const source = buffer.getChannelData(0);
  const ratio = buffer.sampleRate / sampleRate;
  const length = Math.floor(source.length / ratio);
  const samples = new Int16Array(length);
  for (let i = 0; i < length; i++) {
    const s = Math.max(-1, Math.min(1, source[Math.floor(i * ratio)] ?? 0));
    samples[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  const bytes = samples.length * 2;
  const wav = new ArrayBuffer(44 + bytes);
  const view = new DataView(wav);
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + bytes, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, bytes, true);
  new Uint8Array(wav, 44).set(new Uint8Array(samples.buffer));
  return wav;
}

export async function blobToWav(blob: Blob): Promise<Blob> {
  const ctx = new AudioContext();
  const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
  const wav = encodeWav(decoded);
  await ctx.close();
  return new Blob([wav], { type: "audio/wav" });
}

export async function transcribeWav(
  wav: Blob,
): Promise<{ text?: string; language?: string; error?: string }> {
  const form = new FormData();
  form.append("file", wav, "question.wav");
  const res = await fetch("/api/chat/stt", { method: "POST", body: form });
  const data = (await res.json()) as { text?: string; language?: string; error?: string };
  if (!res.ok) return { error: data.error || "Could not transcribe." };
  return { text: data.text, language: data.language || "en" };
}

export async function translateText(text: string, target: string): Promise<string> {
  if (!target || target.toLowerCase().startsWith("en")) return text;
  const res = await fetch("/api/chat/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, target }),
  });
  const data = (await res.json()) as { text?: string };
  return data.text?.trim() || text;
}

export async function speakText(text: string, language = "en"): Promise<HTMLAudioElement | null> {
  const res = await fetch("/api/chat/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, language }),
  });
  if (!res.ok) return null;
  const url = URL.createObjectURL(await res.blob());
  const audio = new Audio(url);
  audio.addEventListener("ended", () => URL.revokeObjectURL(url), { once: true });
  await audio.play();
  return audio;
}
