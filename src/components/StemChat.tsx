"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { answerQuestion, formatProgramLine } from "@/lib/chat/answer.mjs";
import { blobToWav, speakText, spokenAnswer, transcribeWav, translateText } from "@/lib/chat/voice";
import type { ChatAnswer, ChatCatalog, ChatProgram } from "@/lib/chat/types";

type Message = {
  role: "user" | "bot";
  intro: string;
  programs: ChatProgram[];
};

type Mode = "text" | "voice";
type VoiceStatus = "idle" | "recording" | "transcribing" | "speaking";

export default function StemChat({ catalog }: { catalog: ChatCatalog }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("text");
  const [question, setQuestion] = useState("");
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("idle");
  const [voiceHint, setVoiceHint] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "bot",
      intro: `Hi! Ask me about ${catalog.site.name}. I can help with boroughs, ZIPs, cost, ages, and topics like robotics.`,
      programs: [],
    },
  ]);
  const logRef = useRef<HTMLDivElement>(null);
  /** The question the log scrolls to; the answer then reads from its top. */
  const lastQuestionIndex = messages.reduce(
    (found, message, index) => (message.role === "user" ? index : found),
    -1,
  );
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const playerRef = useRef<HTMLAudioElement | null>(null);
  const lastLanguageRef = useRef("en");

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      playerRef.current?.pause();
    };
  }, []);

  async function ask(text: string, speak = false, language = lastLanguageRef.current) {
    const trimmed = text.trim();
    if (!trimmed) return;
    lastLanguageRef.current = language;
    const english = language.toLowerCase().startsWith("en")
      ? trimmed
      : await translateText(trimmed, "en");
    const result: ChatAnswer = answerQuestion(catalog, english);
    const spoken = spokenAnswer(
      result.intro,
      result.programs.map((program) => program.name),
    );
    const voiceLine =
      speak && !language.toLowerCase().startsWith("en")
        ? await translateText(spoken, language)
        : spoken;
    setMessages((current) => [
      ...current,
      { role: "user", intro: trimmed, programs: [] },
      { role: "bot", intro: speak ? voiceLine : result.intro, programs: result.programs },
    ]);
    setQuestion("");
    // Bring the new question to the top of the log rather than jumping to the
    // bottom. An answer can carry eight program cards, and the bottom of the
    // log is the least useful place to land: the reply's first line, and the
    // best-matching programs, would already be scrolled out of sight.
    requestAnimationFrame(() => {
      const log = logRef.current;
      const latest = log?.querySelector<HTMLElement>("[data-latest-question]");
      if (!log || !latest) return;
      const top =
        latest.getBoundingClientRect().top - log.getBoundingClientRect().top + log.scrollTop;
      log.scrollTo({ top, behavior: "smooth" });
    });
    if (speak) {
      setVoiceStatus("speaking");
      speakText(voiceLine, language)
        .then((player) => {
          playerRef.current = player;
          if (!player) setVoiceHint("I answered on screen. Speaking needs an xAI API key.");
        })
        .finally(() => setVoiceStatus("idle"));
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    ask(question);
  }

  async function startRecording() {
    setVoiceHint("");
    playerRef.current?.pause();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.start();
      recorderRef.current = recorder;
      setVoiceStatus("recording");
    } catch {
      setVoiceHint("Please allow the microphone so you can ask out loud.");
    }
  }

  async function stopRecording() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunksRef.current, { type: recorder.mimeType }));
      recorder.stop();
    });
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setVoiceStatus("transcribing");
    try {
      const wav = await blobToWav(blob);
      const { text, language, error } = await transcribeWav(wav);
      if (error || !text) {
        setVoiceHint(error || "I didn’t catch a question. Try again.");
        setVoiceStatus("idle");
        return;
      }
      await ask(text, true, language || "en");
    } catch {
      setVoiceHint("I couldn’t hear that. Try again.");
      setVoiceStatus("idle");
    }
  }

  return (
    <div className="fixed right-4 bottom-4 z-[80] font-body text-ink">
      <button
        type="button"
        className="rounded-full bg-orange px-4 py-3 text-white font-heading font-600 shadow-xl hover:bg-orange-dark"
        aria-expanded={open}
        aria-controls="nova-chat-panel"
        onClick={() => setOpen((value) => !value)}
        suppressHydrationWarning
      >
        Ask about programs
      </button>

      {open && (
        <section
          id="nova-chat-panel"
          role="dialog"
          aria-label={`${catalog.site.name} chat`}
          className="absolute right-0 bottom-16 flex h-[min(560px,calc(100vh-110px))] w-[min(380px,calc(100vw-24px))] flex-col overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-black/10"
        >
          <header className="flex items-start justify-between gap-3 border-b border-black/5 bg-teal-50 px-4 py-3">
            <div>
              <p className="font-heading text-xs font-600 uppercase tracking-wide text-teal-700">
                Questions about programs
              </p>
              <h2 className="font-heading text-xl font-700 text-ink">{catalog.site.name}</h2>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex rounded-full bg-white p-0.5 ring-1 ring-black/10" role="group" aria-label="Ask by text or voice">
                <button
                  type="button"
                  aria-pressed={mode === "text"}
                  onClick={() => setMode("text")}
                  className={`rounded-full px-2.5 py-1 text-xs font-600 ${
                    mode === "text" ? "bg-orange text-white" : "text-ink/70 hover:text-ink"
                  }`}
                >
                  Text
                </button>
                <button
                  type="button"
                  aria-pressed={mode === "voice"}
                  onClick={() => setMode("voice")}
                  className={`rounded-full px-2.5 py-1 text-xs font-600 ${
                    mode === "voice" ? "bg-orange text-white" : "text-ink/70 hover:text-ink"
                  }`}
                >
                  Voice
                </button>
              </div>
              <button
                type="button"
                className="text-2xl leading-none text-ink/70 hover:text-ink"
                aria-label="Close chat"
                onClick={() => setOpen(false)}
              >
                ×
              </button>
            </div>
          </header>

          <div ref={logRef} className="flex flex-1 flex-col gap-2.5 overflow-auto p-3" role="log" aria-live="polite">
            {messages.map((message, index) => (
              <article
                key={`${message.role}-${index}`}
                data-latest-question={
                  message.role === "user" && index === lastQuestionIndex ? "" : undefined
                }
                className={`max-w-[95%] rounded-2xl px-3 py-2 text-sm leading-snug ${
                  message.role === "user"
                    ? "self-end bg-teal-100 text-ink"
                    : "self-start border border-black/5 bg-white"
                }`}
              >
                {message.intro.split("\n\n").map((paragraph) => (
                  <p key={paragraph} className="[&+p]:mt-2">
                    {paragraph}
                  </p>
                ))}
                {message.programs.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {message.programs.map((program) => (
                      <li key={program.id} className="rounded-xl border border-black/5 p-2">
                        <button
                          type="button"
                          className="w-full text-left"
                          onClick={() => ask(`Tell me more about ${program.name}`, mode === "voice")}
                        >
                          <strong className="block font-heading font-600">{program.name}</strong>
                          <span className="mt-0.5 block text-xs text-ink/60">
                            {formatProgramLine(program).replace(`${program.name} — `, "")}
                          </span>
                        </button>
                        <a
                          href={program.signupUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-block text-xs font-600 text-teal-700 hover:text-teal-800"
                        >
                          View & sign up
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
          </div>

          <div className="flex gap-1.5 overflow-x-auto px-3 pb-2">
            {catalog.suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="shrink-0 rounded-full border border-black/10 bg-white px-2.5 py-1 text-xs font-600 text-ink hover:bg-teal-50"
                onClick={() => {
                  setOpen(true);
                  ask(suggestion, mode === "voice");
                }}
              >
                {suggestion}
              </button>
            ))}
          </div>

          {mode === "text" ? (
            <form className="flex gap-2 border-t border-black/5 p-2.5" onSubmit={onSubmit}>
              <label className="sr-only" htmlFor="nova-chat-input">
                Your question
              </label>
              <input
                id="nova-chat-input"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                autoComplete="off"
                placeholder="Free robotics in Brooklyn…"
                className="flex-1 rounded-full border border-black/10 px-3 py-2 text-sm outline-none focus:border-orange"
              />
              <button
                type="submit"
                className="rounded-full bg-orange px-3.5 font-heading font-600 text-sm text-white hover:bg-orange-dark"
              >
                Send
              </button>
            </form>
          ) : (
            <div className="border-t border-black/5 p-3">
              <button
                type="button"
                aria-pressed={voiceStatus === "recording"}
                disabled={voiceStatus === "transcribing" || voiceStatus === "speaking"}
                onClick={() => (voiceStatus === "recording" ? stopRecording() : startRecording())}
                className={`flex w-full items-center justify-center gap-2 rounded-2xl py-3 font-heading font-600 text-white ${
                  voiceStatus === "recording" ? "bg-ink" : "bg-orange hover:bg-orange-dark"
                } disabled:opacity-60`}
              >
                {voiceStatus === "recording"
                  ? "Tap to send"
                  : voiceStatus === "transcribing"
                    ? "Hearing you…"
                    : voiceStatus === "speaking"
                      ? "Speaking…"
                      : "Tap to ask"}
              </button>
              <p className="mt-2 text-center text-xs text-ink/55">
                {voiceHint ||
                  (voiceStatus === "recording"
                    ? "Ask your question, then tap again."
                    : "Speak any language. Grok Voice hears you and answers in the same language. Facts still come from Nova’s program list.")}
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
