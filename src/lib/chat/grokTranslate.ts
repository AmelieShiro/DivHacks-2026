/** Server-only: Grok translates catalog answers into the language the parent asked in. */

export function isEnglish(language: string): boolean {
  return language.toLowerCase().startsWith("en");
}

/** Map a STT BCP-47 tag onto a TTS language Grok Voice accepts. */
export function ttsLanguage(language: string): string {
  const tag = language.toLowerCase().replace("_", "-");
  const primary = tag.split("-")[0] ?? "en";
  const mapped: Record<string, string> = {
    en: "en",
    es: tag === "es-es" || tag.endsWith("-es") ? "es-ES" : "es-MX",
    pt: tag === "pt-pt" || tag.endsWith("-pt") ? "pt-PT" : "pt-BR",
    ar: "ar-SA",
    zh: "zh",
    fr: "fr",
    de: "de",
    hi: "hi",
    id: "id",
    it: "it",
    ja: "ja",
    ko: "ko",
    ru: "ru",
    tr: "tr",
    vi: "vi",
    bn: "bn",
  };
  return mapped[primary] ?? tag;
}

export async function translateWithGrok(text: string, targetLanguage: string): Promise<string> {
  const key = process.env.XAI_API_KEY;
  if (!key || !text.trim() || isEnglish(targetLanguage)) return text;

  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "grok-3-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "Translate the user's text into the requested language. Keep program names, ZIP codes, and organization names as written. Return only the translation.",
        },
        {
          role: "user",
          content: `Language: ${targetLanguage}\n\n${text}`,
        },
      ],
    }),
  });
  if (!res.ok) {
    // Falling back to English is the right behaviour, but do it loudly: a
    // silent fallback looks identical to a language Grok simply left alone.
    console.error(`[translate] xAI ${res.status}: ${(await res.text()).slice(0, 300) || "(no detail)"}`);
    return text;
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content?.trim() || text;
}
