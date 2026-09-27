"use client";

import { usePathname } from "next/navigation";
import Wordmark from "./Wordmark";

/**
 * Hidden on /map, where the map and its list fill the viewport exactly and a
 * footer would put a scrollbar on a page that has nothing else to scroll to.
 */
export default function Footer() {
  const hide = usePathname() === "/map";

  return (
    <footer
      className={`bg-black/25 border-t border-white/10 text-white/80 ${hide ? "hidden" : ""}`}
    >
      <div className="mx-auto max-w-6xl px-5 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
        <Wordmark className="text-2xl" />
        <p className="font-body text-sm text-center sm:text-right">
          Zero-friction STEM discovery for NYC families · Built at DivHacks
        </p>
      </div>
    </footer>
  );
}
