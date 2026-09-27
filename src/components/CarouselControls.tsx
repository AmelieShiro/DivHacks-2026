"use client";

import { useRef, type ReactNode } from "react";

export default function CarouselControls({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  const scroll = (dir: 1 | -1) => {
    ref.current?.scrollBy({ left: dir * 340, behavior: "smooth" });
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => scroll(-1)}
        aria-label="Scroll left"
        className="hidden sm:grid place-items-center absolute -left-4 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-white text-teal-700 shadow-lg ring-1 ring-black/5 hover:bg-orange hover:text-white transition-colors"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
      </button>

      <div
        ref={ref}
        className="no-scrollbar flex gap-5 overflow-x-auto snap-x snap-mandatory pb-2 -mx-1 px-1"
      >
        {children}
      </div>

      <button
        type="button"
        onClick={() => scroll(1)}
        aria-label="Scroll right"
        className="hidden sm:grid place-items-center absolute -right-4 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-white text-teal-700 shadow-lg ring-1 ring-black/5 hover:bg-orange hover:text-white transition-colors"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
      </button>
    </div>
  );
}
