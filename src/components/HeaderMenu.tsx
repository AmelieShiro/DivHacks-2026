"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { to: "/mission", label: "Mission" },
  { to: "/map", label: "Map" },
  { to: "/programs", label: "Programs" },
];

function NavItem({
  to,
  label,
  active,
}: {
  to: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={to}
      suppressHydrationWarning
      className={`font-heading text-lg font-600 px-4 py-1.5 rounded-full transition-colors ${
        active
          ? "bg-orange text-white"
          : "text-ink/80 hover:text-ink hover:bg-teal-50"
      }`}
    >
      {label}
    </Link>
  );
}

export default function HeaderMenu({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Pathname-based styles wait until after mount so the first client paint
  // matches the server HTML (usePathname can be empty during hydration).
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  return (
    <>
      <div className="mx-auto max-w-6xl px-5 h-16 grid grid-cols-[1fr_auto_1fr] items-center">
        <div className="flex items-center" onClick={() => setOpen(false)}>
          {children}
        </div>
        <nav className="hidden md:flex items-center gap-2 justify-center">
          {tabs.map((t) => (
            <NavItem key={t.to} {...t} active={ready && pathname === t.to} />
          ))}
        </nav>
        <div className="flex justify-end">
          <button
            type="button"
            className="md:hidden text-ink p-2 rounded-lg hover:bg-teal-50"
            onClick={() => setOpen((o) => !o)}
            aria-label="Toggle menu"
            suppressHydrationWarning
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>}
            </svg>
          </button>
        </div>
      </div>
      {open && (
        <nav className="md:hidden px-5 pb-4 flex flex-col items-center gap-2 bg-white">
          {tabs.map((t) => (
            <div key={t.to} onClick={() => setOpen(false)}>
              <NavItem {...t} active={ready && pathname === t.to} />
            </div>
          ))}
        </nav>
      )}
    </>
  );
}
