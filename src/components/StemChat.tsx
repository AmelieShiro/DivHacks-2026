"use client";

import { FormEvent, useRef, useState } from "react";
import { answerQuestion, formatProgramLine } from "@/lib/chat/answer.mjs";
import type { ChatAnswer, ChatCatalog, ChatProgram } from "@/lib/chat/types";

type Message = {
  role: "user" | "bot";
  intro: string;
  programs: ChatProgram[];
};

export default function StemChat({ catalog }: { catalog: ChatCatalog }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "bot",
      intro: `Hi! Ask me about ${catalog.site.name}. I can help with boroughs, ZIPs, cost, ages, and topics like robotics.`,
      programs: [],
    },
  ]);
  const logRef = useRef<HTMLDivElement>(null);

  function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const result: ChatAnswer = answerQuestion(catalog, trimmed);
    setMessages((current) => [
      ...current,
      { role: "user", intro: trimmed, programs: [] },
      { role: "bot", intro: result.intro, programs: result.programs },
    ]);
    setQuestion("");
    requestAnimationFrame(() => {
      logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
    });
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    ask(question);
  }

  return (
    <div className="fixed right-4 bottom-4 z-[80] font-body text-ink">
      <button
        type="button"
        className="rounded-full bg-orange px-4 py-3 text-white font-heading font-600 shadow-xl hover:bg-orange-dark"
        aria-expanded={open}
        aria-controls="nova-chat-panel"
        onClick={() => setOpen((value) => !value)}
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
            <button
              type="button"
              className="text-2xl leading-none text-ink/70 hover:text-ink"
              aria-label="Close chat"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </header>

          <div ref={logRef} className="flex flex-1 flex-col gap-2.5 overflow-auto p-3" role="log" aria-live="polite">
            {messages.map((message, index) => (
              <article
                key={`${message.role}-${index}`}
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
                          onClick={() => ask(`Tell me more about ${program.name}`)}
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
                  ask(suggestion);
                }}
              >
                {suggestion}
              </button>
            ))}
          </div>

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
        </section>
      )}
    </div>
  );
}
